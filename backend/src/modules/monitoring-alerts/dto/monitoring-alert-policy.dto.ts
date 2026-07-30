import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MonitoringAlertPolicyScope, MonitoringAlertSeverity, MonitoringAlertType } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsObject, IsOptional, IsString, IsUUID, Max, MaxLength, Min, ValidateNested } from 'class-validator';

export class AlertTypePolicySettingDto {
  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  enabled?: boolean;

  @ApiPropertyOptional({ enum: MonitoringAlertSeverity })
  @IsEnum(MonitoringAlertSeverity)
  @IsOptional()
  severity?: MonitoringAlertSeverity;

  @ApiPropertyOptional({ minimum: 0 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  thresholdMinutes?: number;

  @ApiPropertyOptional({ minimum: 0 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  gracePeriodMinutes?: number;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  workingHoursOnly?: boolean;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  weekendEnabled?: boolean;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  maintenanceIgnore?: boolean;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  autoResolve?: boolean;
}

export class AlertPolicySettingsDto {
  @ApiPropertyOptional({ type: AlertTypePolicySettingDto })
  @ValidateNested()
  @Type(() => AlertTypePolicySettingDto)
  @IsOptional()
  DEVICE_OFFLINE?: AlertTypePolicySettingDto;

  @ApiPropertyOptional({ type: AlertTypePolicySettingDto })
  @ValidateNested()
  @Type(() => AlertTypePolicySettingDto)
  @IsOptional()
  MISSING_HEARTBEAT?: AlertTypePolicySettingDto;

  @ApiPropertyOptional({ type: AlertTypePolicySettingDto })
  @ValidateNested()
  @Type(() => AlertTypePolicySettingDto)
  @IsOptional()
  MONITORING_DISABLED?: AlertTypePolicySettingDto;

  @ApiPropertyOptional({ type: AlertTypePolicySettingDto })
  @ValidateNested()
  @Type(() => AlertTypePolicySettingDto)
  @IsOptional()
  DEVICE_REVOKED?: AlertTypePolicySettingDto;

  @ApiPropertyOptional({ type: AlertTypePolicySettingDto })
  @ValidateNested()
  @Type(() => AlertTypePolicySettingDto)
  @IsOptional()
  REREGISTRATION_REQUIRED?: AlertTypePolicySettingDto;

  @ApiPropertyOptional({ type: AlertTypePolicySettingDto })
  @ValidateNested()
  @Type(() => AlertTypePolicySettingDto)
  @IsOptional()
  EXCESSIVE_IDLE?: AlertTypePolicySettingDto;

  @ApiPropertyOptional({ type: AlertTypePolicySettingDto })
  @ValidateNested()
  @Type(() => AlertTypePolicySettingDto)
  @IsOptional()
  SCREENSHOT_MISSING?: AlertTypePolicySettingDto;
}

export class MonitoringAlertPolicyQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page = 1;

  @ApiPropertyOptional({ default: 20, maximum: 100 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit = 20;

  @ApiPropertyOptional({ maxLength: 100 })
  @IsString()
  @MaxLength(100)
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({ enum: MonitoringAlertPolicyScope })
  @IsEnum(MonitoringAlertPolicyScope)
  @IsOptional()
  scope?: MonitoringAlertPolicyScope;

  @ApiPropertyOptional()
  @IsBoolean()
  @Type(() => Boolean)
  @IsOptional()
  enabled?: boolean;
}

export class CreateMonitoringAlertPolicyDto {
  @ApiProperty()
  @IsString()
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(500)
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ default: true })
  @IsBoolean()
  @IsOptional()
  enabled?: boolean;

  @ApiPropertyOptional({ default: 100 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  priority?: number;

  @ApiProperty({ enum: MonitoringAlertPolicyScope })
  @IsEnum(MonitoringAlertPolicyScope)
  scope!: MonitoringAlertPolicyScope;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID()
  @IsOptional()
  companyId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID()
  @IsOptional()
  branchId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID()
  @IsOptional()
  departmentId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID()
  @IsOptional()
  employeeId?: string;

  @ApiProperty({ type: AlertPolicySettingsDto })
  @IsObject()
  settings!: Record<MonitoringAlertType, AlertTypePolicySettingDto>;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsString()
  @IsOptional()
  maintenanceStart?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsString()
  @IsOptional()
  maintenanceEnd?: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsString()
  @MaxLength(500)
  @IsOptional()
  maintenanceReason?: string;
}

export class UpdateMonitoringAlertPolicyDto extends CreateMonitoringAlertPolicyDto {}

export class MonitoringAlertPolicyResponseDto {
  @ApiProperty()
  id!: string;

  @ApiPropertyOptional({ nullable: true })
  companyId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  branchId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  departmentId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  employeeId?: string | null;

  @ApiProperty()
  name!: string;

  @ApiPropertyOptional({ nullable: true })
  description?: string | null;

  @ApiProperty()
  enabled!: boolean;

  @ApiProperty()
  priority!: number;

  @ApiProperty({ enum: MonitoringAlertPolicyScope })
  scope!: MonitoringAlertPolicyScope;

  @ApiProperty()
  settings!: Record<string, unknown>;

  @ApiPropertyOptional({ nullable: true, format: 'date-time' })
  maintenanceStart?: Date | null;

  @ApiPropertyOptional({ nullable: true, format: 'date-time' })
  maintenanceEnd?: Date | null;

  @ApiPropertyOptional({ nullable: true })
  maintenanceReason?: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: Date;
}

export class MonitoringAlertPolicyListResponseDto {
  @ApiProperty({ type: [MonitoringAlertPolicyResponseDto] })
  data!: MonitoringAlertPolicyResponseDto[];

  @ApiProperty()
  meta!: { page: number; limit: number; total: number; totalPages: number };
}

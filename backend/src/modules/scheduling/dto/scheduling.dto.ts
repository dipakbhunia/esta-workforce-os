import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  HolidayType,
  RosterDaySource,
  RosterDayType,
  ShiftRosterStatus,
  WeeklyOffRuleType,
} from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class CreateShiftRosterPeriodDto {
  @ApiProperty({ example: 'August Engineering Roster' })
  @IsString()
  @MaxLength(120)
  name!: string;

  @ApiProperty({ example: 'AUG-ENG-2026' })
  @IsString()
  @MaxLength(40)
  code!: string;

  @ApiProperty({ format: 'date', example: '2026-08-01' })
  @IsISO8601({ strict: true })
  dateFrom!: string;

  @ApiProperty({ format: 'date', example: '2026-08-31' })
  @IsISO8601({ strict: true })
  dateTo!: string;

  @ApiPropertyOptional({ example: 'Asia/Kolkata' })
  @IsString()
  @MaxLength(80)
  @IsOptional()
  timezone?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID()
  @IsOptional()
  branchId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID()
  @IsOptional()
  departmentId?: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(1000)
  @IsOptional()
  notes?: string;
}

export class UpdateShiftRosterPeriodDto extends PartialType(CreateShiftRosterPeriodDto) {}

export class ShiftRosterPeriodQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ShiftRosterStatus })
  @IsEnum(ShiftRosterStatus)
  @IsOptional()
  status?: ShiftRosterStatus;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID()
  @IsOptional()
  branchId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID()
  @IsOptional()
  departmentId?: string;

  @ApiPropertyOptional({ format: 'date' })
  @IsISO8601({ strict: true })
  @IsOptional()
  dateFrom?: string;

  @ApiPropertyOptional({ format: 'date' })
  @IsISO8601({ strict: true })
  @IsOptional()
  dateTo?: string;

  @ApiPropertyOptional({ enum: ['CSV'], description: 'CSV export format.' })
  @IsIn(['CSV'])
  @IsOptional()
  format?: 'CSV';
}

export class ShiftRosterSummaryDto {
  @ApiProperty()
  total!: number;

  @ApiProperty()
  draft!: number;

  @ApiProperty()
  published!: number;

  @ApiProperty()
  locked!: number;

  @ApiProperty()
  cancelled!: number;
}

export class ShiftRosterPeriodListResponseDto {
  @ApiProperty({ isArray: true, type: Object })
  data!: unknown[];

  @ApiProperty({ type: Object })
  meta!: unknown;

  @ApiProperty({ type: ShiftRosterSummaryDto })
  summary!: ShiftRosterSummaryDto;
}

export class ShiftRosterEmployeeUserDto {
  @ApiPropertyOptional({ nullable: true })
  firstName?: string | null;

  @ApiPropertyOptional({ nullable: true })
  lastName?: string | null;

  @ApiPropertyOptional({ nullable: true })
  email?: string | null;
}

export class ShiftRosterOrgUnitDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;
}

export class ShiftRosterDayEmployeeDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  employeeCode!: string;

  @ApiProperty()
  displayName!: string;

  @ApiPropertyOptional({ nullable: true })
  firstName?: string | null;

  @ApiPropertyOptional({ nullable: true })
  lastName?: string | null;

  @ApiPropertyOptional({ type: ShiftRosterEmployeeUserDto, nullable: true })
  user?: ShiftRosterEmployeeUserDto | null;

  @ApiPropertyOptional({ type: ShiftRosterOrgUnitDto, nullable: true })
  department?: ShiftRosterOrgUnitDto | null;

  @ApiPropertyOptional({ type: ShiftRosterOrgUnitDto, nullable: true })
  designation?: ShiftRosterOrgUnitDto | null;
}

export class ShiftRosterDayShiftDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  code!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  startTime!: string;

  @ApiProperty()
  endTime!: string;

  @ApiPropertyOptional({ nullable: true })
  timezone?: string | null;
}

export class ShiftRosterDayResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  employeeId!: string;

  @ApiProperty({ format: 'date' })
  workDate!: string;

  @ApiProperty({ enum: RosterDayType })
  dayType!: RosterDayType;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  shiftId?: string | null;

  @ApiProperty({ enum: RosterDaySource })
  source!: RosterDaySource;

  @ApiPropertyOptional({ nullable: true })
  notes?: string | null;

  @ApiPropertyOptional({ type: ShiftRosterDayEmployeeDto, nullable: true })
  employee?: ShiftRosterDayEmployeeDto | null;

  @ApiPropertyOptional({ type: ShiftRosterDayShiftDto, nullable: true })
  shift?: ShiftRosterDayShiftDto | null;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  updatedAt!: string;
}

export class ShiftRosterDayListResponseDto {
  @ApiProperty({ isArray: true, type: ShiftRosterDayResponseDto })
  data!: ShiftRosterDayResponseDto[];

  @ApiProperty({ type: Object })
  meta!: unknown;
}
export class UpsertShiftRosterDayDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  employeeId!: string;

  @ApiProperty({ format: 'date' })
  @IsISO8601({ strict: true })
  workDate!: string;

  @ApiProperty({ enum: RosterDayType })
  @IsEnum(RosterDayType)
  dayType!: RosterDayType;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsUUID()
  @IsOptional()
  shiftId?: string | null;

  @ApiPropertyOptional({ enum: RosterDaySource, default: RosterDaySource.MANUAL })
  @IsEnum(RosterDaySource)
  @IsOptional()
  source?: RosterDaySource;

  @ApiPropertyOptional({ nullable: true })
  @IsString()
  @MaxLength(1000)
  @IsOptional()
  notes?: string | null;
}

export class BulkUpsertShiftRosterDaysDto {
  @ApiProperty({ type: UpsertShiftRosterDayDto, isArray: true })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpsertShiftRosterDayDto)
  days!: UpsertShiftRosterDayDto[];
}

export class ShiftRosterDayQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID()
  @IsOptional()
  employeeId?: string;

  @ApiPropertyOptional({ enum: RosterDayType })
  @IsEnum(RosterDayType)
  @IsOptional()
  dayType?: RosterDayType;

  @ApiPropertyOptional({ format: 'date' })
  @IsISO8601({ strict: true })
  @IsOptional()
  dateFrom?: string;

  @ApiPropertyOptional({ format: 'date' })
  @IsISO8601({ strict: true })
  @IsOptional()
  dateTo?: string;

  @ApiPropertyOptional({ enum: ['CSV'], description: 'CSV export format.' })
  @IsIn(['CSV'])
  @IsOptional()
  format?: 'CSV';
}

export class ResolveDayQueryDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  employeeId!: string;

  @ApiPropertyOptional({ format: 'date' })
  @IsISO8601({ strict: true })
  @IsOptional()
  workDate?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsISO8601()
  @IsOptional()
  timestamp?: string;
}

export class CreateWeeklyOffRuleDto {
  @ApiProperty()
  @IsString()
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(80)
  @IsOptional()
  timezone?: string;

  @ApiPropertyOptional({ enum: WeeklyOffRuleType })
  @IsEnum(WeeklyOffRuleType)
  @IsOptional()
  ruleType?: WeeklyOffRuleType;

  @ApiProperty({ example: [0, 6], description: 'Weekdays as 0=Sunday through 6=Saturday.' })
  @IsArray()
  @Type(() => Number)
  weekdays!: number[];

  @ApiProperty({ format: 'date' })
  @IsISO8601({ strict: true })
  effectiveFrom!: string;

  @ApiPropertyOptional({ format: 'date', nullable: true })
  @IsISO8601({ strict: true })
  @IsOptional()
  effectiveTo?: string | null;

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

  @ApiPropertyOptional({ default: 100 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10000)
  @IsOptional()
  priority?: number;

  @ApiPropertyOptional({ default: true })
  @IsBoolean()
  @IsOptional()
  enabled?: boolean;
}

export class UpdateWeeklyOffRuleDto extends PartialType(CreateWeeklyOffRuleDto) {}

export class WeeklyOffRuleSummaryDto {
  @ApiProperty()
  total!: number;

  @ApiProperty()
  active!: number;

  @ApiProperty()
  inactive!: number;

  @ApiProperty()
  companyScope!: number;

  @ApiProperty()
  branchScope!: number;

  @ApiProperty()
  departmentScope!: number;

  @ApiProperty()
  employeeScope!: number;
}

export class WeeklyOffRuleListResponseDto {
  @ApiProperty({ isArray: true, type: Object })
  data!: unknown[];

  @ApiProperty({ type: Object })
  meta!: unknown;

  @ApiProperty({ type: WeeklyOffRuleSummaryDto })
  summary!: WeeklyOffRuleSummaryDto;
}

export class WeeklyOffRuleQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  enabled?: boolean;

  @ApiPropertyOptional({ enum: ['COMPANY', 'BRANCH', 'DEPARTMENT', 'EMPLOYEE'] })
  @IsIn(['COMPANY', 'BRANCH', 'DEPARTMENT', 'EMPLOYEE'])
  @IsOptional()
  scope?: 'COMPANY' | 'BRANCH' | 'DEPARTMENT' | 'EMPLOYEE';

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

  @ApiPropertyOptional({ enum: WeeklyOffRuleType })
  @IsEnum(WeeklyOffRuleType)
  @IsOptional()
  ruleType?: WeeklyOffRuleType;

  @ApiPropertyOptional({ minimum: 0, maximum: 6, description: 'Weekday as 0=Sunday through 6=Saturday.' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(6)
  @IsOptional()
  day?: number;

  @ApiPropertyOptional({ format: 'date' })
  @IsISO8601({ strict: true })
  @IsOptional()
  dateFrom?: string;

  @ApiPropertyOptional({ format: 'date' })
  @IsISO8601({ strict: true })
  @IsOptional()
  dateTo?: string;

  @ApiPropertyOptional({ enum: ['CSV'], description: 'CSV export format.' })
  @IsIn(['CSV'])
  @IsOptional()
  format?: 'CSV';
}

export class CreateHolidayCalendarDto {
  @ApiProperty()
  @IsString()
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(80)
  @IsOptional()
  timezone?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID()
  @IsOptional()
  branchId?: string;

  @ApiPropertyOptional({ default: true })
  @IsBoolean()
  @IsOptional()
  enabled?: boolean;
}

export class UpdateHolidayCalendarDto extends PartialType(CreateHolidayCalendarDto) {}

export class HolidayCalendarQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  enabled?: boolean;
}

export class CreateHolidayDto {
  @ApiProperty({ format: 'date' })
  @IsISO8601({ strict: true })
  date!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional({ enum: HolidayType })
  @IsEnum(HolidayType)
  @IsOptional()
  type?: HolidayType;

  @ApiPropertyOptional({ default: false })
  @IsBoolean()
  @IsOptional()
  optional?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsBoolean()
  @IsOptional()
  recurring?: boolean;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(1000)
  @IsOptional()
  notes?: string;
}

export class UpdateHolidayDto extends PartialType(CreateHolidayDto) {}

export class SchedulingValidationIssueDto {
  @ApiProperty()
  path!: string;

  @ApiProperty()
  message!: string;
}

export class RosterPreviewResponseDto {
  @ApiProperty()
  valid!: boolean;

  @ApiProperty({ type: SchedulingValidationIssueDto, isArray: true })
  errors!: SchedulingValidationIssueDto[];

  @ApiProperty({ type: SchedulingValidationIssueDto, isArray: true })
  warnings!: SchedulingValidationIssueDto[];

  @ApiPropertyOptional({ type: SchedulingValidationIssueDto, isArray: true })
  info?: SchedulingValidationIssueDto[];
}

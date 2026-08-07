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

  @ApiProperty({ example: 2026 })
  @Type(() => Number)
  @IsInt()
  @Min(1900)
  @Max(2200)
  year!: number;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(500)
  @IsOptional()
  description?: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(1000)
  @IsOptional()
  notes?: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(80)
  @IsOptional()
  timezone?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID()
  @IsOptional()
  branchId?: string | null;

  @ApiPropertyOptional({ default: true })
  @IsBoolean()
  @IsOptional()
  enabled?: boolean;
}

export class UpdateHolidayCalendarDto extends PartialType(CreateHolidayCalendarDto) {}

export class HolidayCalendarSummaryDto {
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
  totalHolidays!: number;

  @ApiProperty()
  mandatoryHolidays!: number;

  @ApiProperty()
  optionalHolidays!: number;
}

export class HolidayCalendarListResponseDto {
  @ApiProperty({ isArray: true, type: Object })
  data!: unknown[];

  @ApiProperty({ type: Object })
  meta!: unknown;

  @ApiProperty({ type: HolidayCalendarSummaryDto })
  summary!: HolidayCalendarSummaryDto;
}

export class HolidayCalendarQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  enabled?: boolean;

  @ApiPropertyOptional({ enum: ['COMPANY', 'BRANCH'] })
  @IsIn(['COMPANY', 'BRANCH'])
  @IsOptional()
  scope?: 'COMPANY' | 'BRANCH';

  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID()
  @IsOptional()
  branchId?: string;

  @ApiPropertyOptional({ example: 2026 })
  @Type(() => Number)
  @IsInt()
  @Min(1900)
  @Max(2200)
  @IsOptional()
  year?: number;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(80)
  @IsOptional()
  timezone?: string;

  @ApiPropertyOptional({ enum: ['CSV'], description: 'CSV export format.' })
  @IsIn(['CSV'])
  @IsOptional()
  format?: 'CSV';
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

export class HolidayQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: HolidayType })
  @IsEnum(HolidayType)
  @IsOptional()
  type?: HolidayType;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  optional?: boolean;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  recurring?: boolean;

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

export class RosterTemplateDayInputDto {
  @ApiProperty({ minimum: 1, maximum: 7, description: 'Display sequence, Monday through Sunday.' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(7)
  sequence!: number;

  @ApiProperty({ minimum: 0, maximum: 6, description: 'Weekday as 0=Sunday through 6=Saturday.' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek!: number;

  @ApiProperty({ enum: ['WORKING', 'WEEKLY_OFF', 'NO_SHIFT'] })
  @IsIn(['WORKING', 'WEEKLY_OFF', 'NO_SHIFT'])
  dayType!: 'WORKING' | 'WEEKLY_OFF' | 'NO_SHIFT';

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsUUID()
  @IsOptional()
  shiftId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsString()
  @MaxLength(500)
  @IsOptional()
  notes?: string | null;
}

export class CreateRosterTemplateDto {
  @ApiProperty()
  @IsString()
  @MaxLength(120)
  name!: string;

  @ApiProperty({ example: 'GENERAL_WEEKLY' })
  @IsString()
  @MaxLength(40)
  code!: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(500)
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ example: 'Asia/Kolkata' })
  @IsString()
  @MaxLength(80)
  @IsOptional()
  timezone?: string;

  @ApiPropertyOptional({ default: true })
  @IsBoolean()
  @IsOptional()
  enabled?: boolean;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID()
  @IsOptional()
  branchId?: string | null;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID()
  @IsOptional()
  departmentId?: string | null;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(1000)
  @IsOptional()
  notes?: string;

  @ApiProperty({ type: RosterTemplateDayInputDto, isArray: true })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RosterTemplateDayInputDto)
  days!: RosterTemplateDayInputDto[];
}

export class UpdateRosterTemplateDto extends PartialType(CreateRosterTemplateDto) {}

export class RosterTemplateSummaryDto {
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
}

export class RosterTemplateListResponseDto {
  @ApiProperty({ isArray: true, type: Object })
  data!: unknown[];

  @ApiProperty({ type: Object })
  meta!: unknown;

  @ApiProperty({ type: RosterTemplateSummaryDto })
  summary!: RosterTemplateSummaryDto;
}

export class RosterTemplateQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  enabled?: boolean;

  @ApiPropertyOptional({ enum: ['COMPANY', 'BRANCH', 'DEPARTMENT'] })
  @IsIn(['COMPANY', 'BRANCH', 'DEPARTMENT'])
  @IsOptional()
  scope?: 'COMPANY' | 'BRANCH' | 'DEPARTMENT';

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
  @MaxLength(80)
  @IsOptional()
  timezone?: string;

  @ApiPropertyOptional({ enum: ['CSV'], description: 'CSV export format.' })
  @IsIn(['CSV'])
  @IsOptional()
  format?: 'CSV';
}

export class PreviewRosterTemplateDto {
  @ApiProperty({ format: 'date' })
  @IsISO8601({ strict: true })
  dateFrom!: string;

  @ApiProperty({ format: 'date' })
  @IsISO8601({ strict: true })
  dateTo!: string;
}

export class ApplyRosterTemplateDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  templateId!: string;

  @ApiProperty({ type: String, isArray: true, format: 'uuid' })
  @IsArray()
  @IsUUID(undefined, { each: true })
  employeeIds!: string[];

  @ApiProperty({ format: 'date' })
  @IsISO8601({ strict: true })
  dateFrom!: string;

  @ApiProperty({ format: 'date' })
  @IsISO8601({ strict: true })
  dateTo!: string;

  @ApiPropertyOptional({ enum: ['EMPTY_ONLY', 'REPLACE_SELECTED'], default: 'EMPTY_ONLY' })
  @IsIn(['EMPTY_ONLY', 'REPLACE_SELECTED'])
  @IsOptional()
  overwriteMode?: 'EMPTY_ONLY' | 'REPLACE_SELECTED';
}

export class ApplyRosterTemplateResponseDto {
  @ApiProperty()
  appliedCount!: number;

  @ApiProperty()
  skippedCount!: number;

  @ApiProperty()
  employeeCount!: number;

  @ApiProperty()
  dateCount!: number;
}

export class RotationPatternDayInputDto {
  @ApiProperty({ minimum: 1, maximum: 90 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(90)
  sequence!: number;

  @ApiProperty({ enum: ['WORKING', 'WEEKLY_OFF', 'NO_SHIFT'] })
  @IsIn(['WORKING', 'WEEKLY_OFF', 'NO_SHIFT'])
  dayType!: 'WORKING' | 'WEEKLY_OFF' | 'NO_SHIFT';

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsUUID()
  @IsOptional()
  shiftId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsString()
  @MaxLength(120)
  @IsOptional()
  label?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsString()
  @MaxLength(500)
  @IsOptional()
  notes?: string | null;
}

export class CreateRotationPatternDto {
  @ApiProperty()
  @IsString()
  @MaxLength(120)
  name!: string;

  @ApiProperty({ example: 'FOUR_ON_TWO_OFF' })
  @IsString()
  @MaxLength(40)
  code!: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(500)
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ example: 'Asia/Kolkata' })
  @IsString()
  @MaxLength(80)
  @IsOptional()
  timezone?: string;

  @ApiProperty({ minimum: 2, maximum: 90 })
  @Type(() => Number)
  @IsInt()
  @Min(2)
  @Max(90)
  cycleLengthDays!: number;

  @ApiPropertyOptional({ format: 'date', nullable: true })
  @IsISO8601({ strict: true })
  @IsOptional()
  anchorDate?: string | null;

  @ApiPropertyOptional({ default: true })
  @IsBoolean()
  @IsOptional()
  enabled?: boolean;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsUUID()
  @IsOptional()
  branchId?: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsUUID()
  @IsOptional()
  departmentId?: string | null;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(1000)
  @IsOptional()
  notes?: string;

  @ApiProperty({ type: RotationPatternDayInputDto, isArray: true })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RotationPatternDayInputDto)
  days!: RotationPatternDayInputDto[];
}

export class UpdateRotationPatternDto extends PartialType(CreateRotationPatternDto) {}

export class RotationPatternSummaryDto {
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
}

export class RotationPatternListResponseDto {
  @ApiProperty({ isArray: true, type: Object })
  data!: unknown[];

  @ApiProperty({ type: Object })
  meta!: unknown;

  @ApiProperty({ type: RotationPatternSummaryDto })
  summary!: RotationPatternSummaryDto;
}

export class RotationPatternQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  enabled?: boolean;

  @ApiPropertyOptional({ enum: ['COMPANY', 'BRANCH', 'DEPARTMENT'] })
  @IsIn(['COMPANY', 'BRANCH', 'DEPARTMENT'])
  @IsOptional()
  scope?: 'COMPANY' | 'BRANCH' | 'DEPARTMENT';

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
  @MaxLength(80)
  @IsOptional()
  timezone?: string;

  @ApiPropertyOptional({ enum: ['CSV'], description: 'CSV export format.' })
  @IsIn(['CSV'])
  @IsOptional()
  format?: 'CSV';
}

export class PreviewRotationPatternDto {
  @ApiProperty({ format: 'date' })
  @IsISO8601({ strict: true })
  dateFrom!: string;

  @ApiPropertyOptional({ format: 'date' })
  @IsISO8601({ strict: true })
  @IsOptional()
  dateTo?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 180, default: 30 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(180)
  @IsOptional()
  numberOfDays?: number;

  @ApiPropertyOptional({ format: 'date', description: 'Optional preview anchor. Defaults to the pattern anchor, then dateFrom.' })
  @IsISO8601({ strict: true })
  @IsOptional()
  anchorDate?: string;
}

export class ApplyRotationPatternDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  patternId!: string;

  @ApiProperty({ type: String, isArray: true, format: 'uuid' })
  @IsArray()
  @IsUUID(undefined, { each: true })
  employeeIds!: string[];

  @ApiProperty({ format: 'date' })
  @IsISO8601({ strict: true })
  dateFrom!: string;

  @ApiProperty({ format: 'date' })
  @IsISO8601({ strict: true })
  dateTo!: string;

  @ApiPropertyOptional({ enum: ['PATTERN_ANCHOR', 'START_FROM_SEQUENCE_ONE'], default: 'PATTERN_ANCHOR' })
  @IsIn(['PATTERN_ANCHOR', 'START_FROM_SEQUENCE_ONE'])
  @IsOptional()
  alignmentMode?: 'PATTERN_ANCHOR' | 'START_FROM_SEQUENCE_ONE';

  @ApiPropertyOptional({ format: 'date', description: 'Required when starting the selected range from a custom sequence anchor.' })
  @IsISO8601({ strict: true })
  @IsOptional()
  anchorDate?: string;

  @ApiPropertyOptional({ enum: ['EMPTY_ONLY', 'REPLACE_SELECTED'], default: 'EMPTY_ONLY' })
  @IsIn(['EMPTY_ONLY', 'REPLACE_SELECTED'])
  @IsOptional()
  overwriteMode?: 'EMPTY_ONLY' | 'REPLACE_SELECTED';
}

export class ApplyRotationPatternResponseDto {
  @ApiProperty()
  appliedCount!: number;

  @ApiProperty()
  skippedCount!: number;

  @ApiProperty()
  employeeCount!: number;

  @ApiProperty()
  dateCount!: number;
}
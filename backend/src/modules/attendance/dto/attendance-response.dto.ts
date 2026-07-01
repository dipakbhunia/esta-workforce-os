import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AttendanceLogType, AttendanceStatus } from '@prisma/client';

export class AttendanceUserDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Demo' })
  firstName!: string;

  @ApiProperty({ example: 'Admin' })
  lastName!: string;

  @ApiProperty({ example: 'admin@demo.esta.local' })
  email!: string;
}

export class AttendanceEmployeeDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'EMP-ADMIN-001' })
  employeeCode!: string;

  @ApiProperty({ type: AttendanceUserDto })
  user!: AttendanceUserDto;
}

export class AttendanceShiftDto {
  @ApiProperty({ example: '09:00' })
  startTime!: string;

  @ApiProperty({ example: '18:00' })
  endTime!: string;

  @ApiProperty({ example: 'Asia/Kolkata' })
  timezone!: string;
}

export class AttendanceLogDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: AttendanceLogType })
  type!: AttendanceLogType;

  @ApiProperty({ format: 'date-time' })
  occurredAt!: Date;

  @ApiPropertyOptional({ nullable: true })
  note!: string | null;
}

export class AttendanceBreakPolicyDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Lunch Break' })
  name!: string;

  @ApiProperty({ example: 'LUNCH' })
  code!: string;

  @ApiProperty({ example: 60 })
  allowedMinutes!: number;

  @ApiProperty()
  isPaid!: boolean;

  @ApiProperty()
  autoPunchOutOnTimeout!: boolean;
}

export class AttendanceBreakLogDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  breakPolicyId!: string | null;

  @ApiPropertyOptional({ example: 'Lunch Break', nullable: true })
  breakTypeName!: string | null;

  @ApiPropertyOptional({ example: 'LUNCH', nullable: true })
  breakTypeCode!: string | null;

  @ApiPropertyOptional({ nullable: true })
  allowedMinutes!: number | null;

  @ApiPropertyOptional({ nullable: true })
  isPaid!: boolean | null;

  @ApiProperty({ format: 'date-time' })
  startedAt!: Date;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  endedAt!: Date | null;

  @ApiPropertyOptional({ nullable: true })
  durationMinutes!: number | null;

  @ApiProperty()
  policyViolated!: boolean;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  autoPunchOutAt!: Date | null;

  @ApiPropertyOptional({ nullable: true })
  note!: string | null;

  @ApiPropertyOptional({ type: AttendanceBreakPolicyDto, nullable: true })
  breakPolicy!: AttendanceBreakPolicyDto | null;
}

export class AttendanceResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  employeeId!: string;

  @ApiProperty({ type: AttendanceEmployeeDto })
  employee!: AttendanceEmployeeDto;

  @ApiProperty({ example: 'EMP-ADMIN-001' })
  employeeCode!: string;

  @ApiProperty({ type: AttendanceUserDto })
  user!: AttendanceUserDto;

  @ApiProperty({ format: 'date', example: '2026-07-01' })
  attendanceDate!: string;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  punchInAt!: Date | null;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  punchOutAt!: Date | null;

  @ApiProperty()
  workedMinutes!: number;

  @ApiProperty()
  expectedMinutes!: number;

  @ApiProperty()
  breakMinutes!: number;

  @ApiProperty({ enum: AttendanceStatus })
  status!: AttendanceStatus;

  @ApiPropertyOptional({ nullable: true })
  autoPunchOutReason!: string | null;

  @ApiProperty({ type: AttendanceShiftDto })
  shift!: AttendanceShiftDto;

  @ApiProperty({ format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: Date;
}

export class AttendanceDetailResponseDto extends AttendanceResponseDto {
  @ApiProperty({ type: AttendanceLogDto, isArray: true })
  logs!: AttendanceLogDto[];

  @ApiProperty({ type: AttendanceBreakLogDto, isArray: true })
  breaks!: AttendanceBreakLogDto[];
}

export type AttendanceTimelineEventType =
  | 'PUNCH_IN'
  | 'PUNCH_OUT'
  | 'BREAK_START'
  | 'BREAK_END'
  | 'AUTO_PUNCH_OUT'
  | 'HEARTBEAT_LOST';

export type AttendanceTimelineEventSource =
  | 'ATTENDANCE'
  | 'BREAK'
  | 'SYSTEM'
  | 'MONITORING';

export class AttendanceTimelineEventDto {
  @ApiProperty({ example: 'attendance-log:5f0c1ef6-51f2-41f8-bd90-fc145d51fcb0' })
  eventId!: string;

  @ApiProperty({
    enum: [
      'PUNCH_IN',
      'PUNCH_OUT',
      'BREAK_START',
      'BREAK_END',
      'AUTO_PUNCH_OUT',
      'HEARTBEAT_LOST',
    ],
  })
  type!: AttendanceTimelineEventType;

  @ApiProperty({ format: 'date-time' })
  time!: Date;

  @ApiProperty({ example: 'Punched in' })
  title!: string;

  @ApiProperty({ example: 'Employee punched in for the attendance session.' })
  description!: string;

  @ApiProperty({ enum: ['ATTENDANCE', 'BREAK', 'SYSTEM', 'MONITORING'] })
  source!: AttendanceTimelineEventSource;

  @ApiProperty({ type: 'object', additionalProperties: true })
  metadata!: Record<string, unknown>;
}

export class AttendanceTimelineResponseDto {
  @ApiProperty({ format: 'uuid' })
  attendanceId!: string;

  @ApiProperty({ type: AttendanceTimelineEventDto, isArray: true })
  events!: AttendanceTimelineEventDto[];
}

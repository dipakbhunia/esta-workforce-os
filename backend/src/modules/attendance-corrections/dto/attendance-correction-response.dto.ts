import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  AttendanceCorrectionStatus,
  AttendanceCorrectionType,
} from '@prisma/client';

export class AttendanceCorrectionUserDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Demo' })
  firstName!: string;

  @ApiProperty({ example: 'Admin' })
  lastName!: string;

  @ApiProperty({ example: 'admin@demo.esta.local' })
  email!: string;
}

export class AttendanceCorrectionEmployeeDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'EMP-ADMIN-001' })
  employeeCode!: string;

  @ApiProperty({ type: AttendanceCorrectionUserDto })
  user!: AttendanceCorrectionUserDto;
}

export class AttendanceCorrectionAttendanceDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'date', example: '2026-07-01' })
  attendanceDate!: string;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  punchInAt!: Date | null;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  punchOutAt!: Date | null;
}

export class AttendanceCorrectionResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  companyId!: string;

  @ApiProperty({ format: 'uuid' })
  attendanceId!: string;

  @ApiProperty({ format: 'uuid' })
  employeeId!: string;

  @ApiProperty({ format: 'uuid' })
  requestedByUserId!: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  reviewedByUserId!: string | null;

  @ApiProperty({ enum: AttendanceCorrectionType })
  type!: AttendanceCorrectionType;

  @ApiProperty({ enum: AttendanceCorrectionStatus })
  status!: AttendanceCorrectionStatus;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  originalPunchInAt!: Date | null;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  originalPunchOutAt!: Date | null;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  requestedPunchInAt!: Date | null;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  requestedPunchOutAt!: Date | null;

  @ApiProperty()
  reason!: string;

  @ApiPropertyOptional({ nullable: true })
  reviewerComment!: string | null;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  reviewedAt!: Date | null;

  @ApiProperty({ type: AttendanceCorrectionEmployeeDto })
  employee!: AttendanceCorrectionEmployeeDto;

  @ApiProperty({ type: AttendanceCorrectionAttendanceDto })
  attendance!: AttendanceCorrectionAttendanceDto;

  @ApiProperty({ type: AttendanceCorrectionUserDto })
  requestedBy!: AttendanceCorrectionUserDto;

  @ApiPropertyOptional({ type: AttendanceCorrectionUserDto, nullable: true })
  reviewedBy!: AttendanceCorrectionUserDto | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: Date;
}

export class AttendanceCorrectionPaginationMetaDto {
  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  limit!: number;

  @ApiProperty({ example: 42 })
  total!: number;

  @ApiProperty({ example: 3 })
  totalPages!: number;
}

export class AttendanceCorrectionPaginatedResponseDto {
  @ApiProperty({ type: AttendanceCorrectionResponseDto, isArray: true })
  data!: AttendanceCorrectionResponseDto[];

  @ApiProperty({ type: AttendanceCorrectionPaginationMetaDto })
  meta!: AttendanceCorrectionPaginationMetaDto;
}

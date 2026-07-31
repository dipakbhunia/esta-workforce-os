import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  AssignmentSource,
  ShiftAssignmentStatus,
  ShiftAssignmentType,
} from '@prisma/client';

export class ShiftAssignmentUserDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Demo' })
  firstName!: string;

  @ApiProperty({ example: 'Admin' })
  lastName!: string;

  @ApiProperty({ example: 'admin@demo.esta.local' })
  email!: string;
}

export class ShiftAssignmentEmployeeDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'EMP-001' })
  employeeCode!: string;

  @ApiProperty({ example: 'Demo Employee' })
  displayName!: string;

  @ApiProperty({ type: ShiftAssignmentUserDto })
  user!: ShiftAssignmentUserDto;

  @ApiPropertyOptional({
    nullable: true,
    example: { id: 'uuid', name: 'Engineering' },
  })
  department!: { id: string; name: string } | null;

  @ApiPropertyOptional({
    nullable: true,
    example: { id: 'uuid', name: 'Software Engineer' },
  })
  designation!: { id: string; name: string } | null;
}

export class ShiftAssignmentShiftDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'General Shift' })
  name!: string;

  @ApiProperty({ example: 'GENERAL' })
  code!: string;

  @ApiProperty({ example: '09:00' })
  startTime!: string;

  @ApiProperty({ example: '18:00' })
  endTime!: string;

  @ApiProperty({ example: 'Asia/Kolkata' })
  timezone!: string;
}

export class ShiftAssignmentResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  companyId!: string;

  @ApiProperty({ format: 'uuid' })
  employeeId!: string;

  @ApiProperty({ format: 'uuid' })
  shiftId!: string;

  @ApiProperty({ format: 'date-time' })
  effectiveFrom!: Date;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  effectiveTo!: Date | null;

  @ApiProperty({ enum: ShiftAssignmentStatus })
  status!: ShiftAssignmentStatus;

  @ApiProperty({ enum: ShiftAssignmentType })
  assignmentType!: ShiftAssignmentType;

  @ApiProperty({ enum: AssignmentSource })
  source!: AssignmentSource;

  @ApiPropertyOptional({ nullable: true })
  reason!: string | null;

  @ApiPropertyOptional({ nullable: true })
  notes!: string | null;

  @ApiProperty({ type: ShiftAssignmentEmployeeDto })
  employee!: ShiftAssignmentEmployeeDto;

  @ApiProperty({ type: ShiftAssignmentShiftDto })
  shift!: ShiftAssignmentShiftDto;

  @ApiPropertyOptional({ type: ShiftAssignmentUserDto, nullable: true })
  createdBy!: ShiftAssignmentUserDto | null;

  @ApiPropertyOptional({ type: ShiftAssignmentUserDto, nullable: true })
  updatedBy!: ShiftAssignmentUserDto | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: Date;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  deletedAt!: Date | null;
}

export class ShiftResolutionResponseDto {
  @ApiProperty({ enum: ['ASSIGNMENT', 'EMPLOYEE_FALLBACK'] })
  resolutionSource!: 'ASSIGNMENT' | 'EMPLOYEE_FALLBACK';

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  assignmentId!: string | null;

  @ApiPropertyOptional({ enum: ShiftAssignmentType, nullable: true })
  assignmentType!: ShiftAssignmentType | null;

  @ApiPropertyOptional({ enum: AssignmentSource, nullable: true })
  source!: AssignmentSource | null;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  effectiveFrom!: Date | null;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  effectiveTo!: Date | null;

  @ApiProperty({ type: ShiftAssignmentShiftDto })
  shift!: ShiftAssignmentShiftDto;
}

export class PaginatedShiftAssignmentResponseDto {
  @ApiProperty({ type: ShiftAssignmentResponseDto, isArray: true })
  data!: ShiftAssignmentResponseDto[];

  @ApiProperty({
    example: { page: 1, limit: 20, total: 1, totalPages: 1 },
  })
  meta!: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

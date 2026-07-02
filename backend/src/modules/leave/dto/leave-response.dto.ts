import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LeaveApprovalAction, LeaveRequestStatus } from '@prisma/client';

export class LeaveUserResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Demo' })
  firstName!: string;

  @ApiProperty({ example: 'Admin' })
  lastName!: string;

  @ApiPropertyOptional({ example: 'admin@demo.esta.local' })
  email?: string;
}

export class LeaveEmployeeResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'EMP-ADMIN-001' })
  employeeCode!: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  reportingManagerId?: string | null;

  @ApiPropertyOptional({ type: LeaveUserResponseDto })
  user?: LeaveUserResponseDto;
}

export class LeaveTypeResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  companyId!: string;

  @ApiProperty({ example: 'Casual Leave' })
  name!: string;

  @ApiProperty({ example: 'CASUAL' })
  code!: string;

  @ApiPropertyOptional({ nullable: true })
  description?: string | null;

  @ApiProperty({ example: 12 })
  defaultDays!: number;

  @ApiProperty({ example: true })
  requiresApproval!: boolean;

  @ApiProperty({ example: true })
  managerCanApprove!: boolean;

  @ApiProperty({ format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: Date;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  deletedAt?: Date | null;
}

export class LeaveRequestResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  companyId!: string;

  @ApiProperty({ format: 'uuid' })
  employeeId!: string;

  @ApiProperty({ format: 'uuid' })
  leaveTypeId!: string;

  @ApiProperty({ format: 'date', example: '2026-07-01' })
  startDate!: string;

  @ApiProperty({ format: 'date', example: '2026-07-02' })
  endDate!: string;

  @ApiProperty({ example: 2 })
  totalDays!: number;

  @ApiPropertyOptional({ nullable: true })
  reason?: string | null;

  @ApiProperty({ enum: LeaveRequestStatus })
  status!: LeaveRequestStatus;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  approverId?: string | null;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  reviewedAt?: Date | null;

  @ApiPropertyOptional({ nullable: true })
  reviewComment?: string | null;

  @ApiProperty({ type: LeaveEmployeeResponseDto })
  employee!: LeaveEmployeeResponseDto;

  @ApiProperty({ type: LeaveTypeResponseDto })
  leaveType!: LeaveTypeResponseDto;

  @ApiPropertyOptional({ type: LeaveEmployeeResponseDto, nullable: true })
  approver?: LeaveEmployeeResponseDto | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: Date;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  deletedAt?: Date | null;
}

export class LeaveBalanceResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  companyId!: string;

  @ApiProperty({ format: 'uuid' })
  employeeId!: string;

  @ApiProperty({ format: 'uuid' })
  leaveTypeId!: string;

  @ApiProperty({ example: 2026 })
  year!: number;

  @ApiProperty({ example: 12 })
  allocated!: number;

  @ApiProperty({ example: 3 })
  used!: number;

  @ApiProperty({ example: 9 })
  remaining!: number;

  @ApiProperty({ example: 1 })
  pending!: number;

  @ApiProperty({ type: LeaveEmployeeResponseDto })
  employee!: LeaveEmployeeResponseDto;

  @ApiProperty({ type: LeaveTypeResponseDto })
  leaveType!: LeaveTypeResponseDto;

  @ApiProperty({ format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: Date;
}

export class LeaveApprovalHistoryResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  companyId!: string;

  @ApiProperty({ format: 'uuid' })
  leaveRequestId!: string;

  @ApiProperty({ enum: LeaveApprovalAction })
  action!: LeaveApprovalAction;

  @ApiProperty({ format: 'uuid' })
  actorUserId!: string;

  @ApiPropertyOptional({ nullable: true })
  comment?: string | null;

  @ApiProperty({ type: LeaveUserResponseDto })
  actor!: LeaveUserResponseDto;

  @ApiProperty({ format: 'date-time' })
  createdAt!: Date;
}

export class LeavePaginationMetaDto {
  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  limit!: number;

  @ApiProperty({ example: 42 })
  total!: number;

  @ApiProperty({ example: 3 })
  totalPages!: number;
}

export class PaginatedLeaveTypeResponseDto {
  @ApiProperty({ type: LeaveTypeResponseDto, isArray: true })
  data!: LeaveTypeResponseDto[];

  @ApiProperty({ type: LeavePaginationMetaDto })
  meta!: LeavePaginationMetaDto;
}

export class PaginatedLeaveRequestResponseDto {
  @ApiProperty({ type: LeaveRequestResponseDto, isArray: true })
  data!: LeaveRequestResponseDto[];

  @ApiProperty({ type: LeavePaginationMetaDto })
  meta!: LeavePaginationMetaDto;
}

export class PaginatedLeaveBalanceResponseDto {
  @ApiProperty({ type: LeaveBalanceResponseDto, isArray: true })
  data!: LeaveBalanceResponseDto[];

  @ApiProperty({ type: LeavePaginationMetaDto })
  meta!: LeavePaginationMetaDto;
}

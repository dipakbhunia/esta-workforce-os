import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LeaveRequestStatus } from '@prisma/client';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateLeaveStatusDto {
  @ApiProperty({
    enum: [LeaveRequestStatus.APPROVED, LeaveRequestStatus.REJECTED],
  })
  @IsIn([LeaveRequestStatus.APPROVED, LeaveRequestStatus.REJECTED])
  status!: LeaveRequestStatus;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(500)
  @IsOptional()
  comment?: string;
}

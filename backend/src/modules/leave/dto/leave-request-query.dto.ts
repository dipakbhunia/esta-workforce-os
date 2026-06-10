import { ApiPropertyOptional } from '@nestjs/swagger';
import { LeaveRequestStatus } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class LeaveRequestQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: LeaveRequestStatus })
  @IsEnum(LeaveRequestStatus)
  @IsOptional()
  status?: LeaveRequestStatus;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID()
  @IsOptional()
  employeeId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID()
  @IsOptional()
  leaveTypeId?: string;

  @ApiPropertyOptional({ format: 'date' })
  @IsDateString({ strict: true })
  @IsOptional()
  dateFrom?: string;

  @ApiPropertyOptional({ format: 'date' })
  @IsDateString({ strict: true })
  @IsOptional()
  dateTo?: string;
}

import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  AttendanceCorrectionStatus,
  AttendanceCorrectionType,
} from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class AttendanceCorrectionQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: AttendanceCorrectionStatus })
  @IsEnum(AttendanceCorrectionStatus)
  @IsOptional()
  status?: AttendanceCorrectionStatus;

  @ApiPropertyOptional({ enum: AttendanceCorrectionType })
  @IsEnum(AttendanceCorrectionType)
  @IsOptional()
  type?: AttendanceCorrectionType;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID()
  @IsOptional()
  employeeId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID()
  @IsOptional()
  attendanceId?: string;

  @ApiPropertyOptional({ format: 'date' })
  @IsDateString({ strict: true })
  @IsOptional()
  dateFrom?: string;

  @ApiPropertyOptional({ format: 'date' })
  @IsDateString({ strict: true })
  @IsOptional()
  dateTo?: string;
}

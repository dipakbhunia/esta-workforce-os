import { ApiPropertyOptional } from '@nestjs/swagger';
import { AttendanceStatus } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class AttendanceQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'date' })
  @IsDateString({ strict: true })
  @IsOptional()
  dateFrom?: string;

  @ApiPropertyOptional({ format: 'date' })
  @IsDateString({ strict: true })
  @IsOptional()
  dateTo?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID()
  @IsOptional()
  employeeId?: string;

  @ApiPropertyOptional({ enum: AttendanceStatus })
  @IsEnum(AttendanceStatus)
  @IsOptional()
  status?: AttendanceStatus;
}

import { ApiPropertyOptional } from '@nestjs/swagger';
import { MonitoringDeviceStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsBoolean, IsDateString, IsEnum, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class MonitoringReadQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID()
  @IsOptional()
  employeeId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID()
  @IsOptional()
  deviceId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID()
  @IsOptional()
  branchId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID()
  @IsOptional()
  departmentId?: string;

  @ApiPropertyOptional({ enum: MonitoringDeviceStatus })
  @IsEnum(MonitoringDeviceStatus)
  @IsOptional()
  status?: MonitoringDeviceStatus;

  @ApiPropertyOptional({ example: true })
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  @IsOptional()
  online?: boolean;

  @ApiPropertyOptional({ example: true })
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  @IsOptional()
  monitoringEnabled?: boolean;

  @ApiPropertyOptional({ example: true })
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  @IsOptional()
  browserConnected?: boolean;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsDateString()
  @IsOptional()
  dateFrom?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsDateString()
  @IsOptional()
  dateTo?: string;
}

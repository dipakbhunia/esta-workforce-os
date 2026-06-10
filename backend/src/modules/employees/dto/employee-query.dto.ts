import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  EmployeeStatus,
  EmploymentType,
  WorkMode,
} from '@prisma/client';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class EmployeeQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Super-admin filter only' })
  @IsUUID()
  @IsOptional()
  companyId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID()
  @IsOptional()
  branchId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID()
  @IsOptional()
  departmentId?: string;

  @ApiPropertyOptional({ enum: EmployeeStatus })
  @IsEnum(EmployeeStatus)
  @IsOptional()
  status?: EmployeeStatus;

  @ApiPropertyOptional({ enum: EmploymentType })
  @IsEnum(EmploymentType)
  @IsOptional()
  employmentType?: EmploymentType;

  @ApiPropertyOptional({ enum: WorkMode })
  @IsEnum(WorkMode)
  @IsOptional()
  workMode?: WorkMode;
}

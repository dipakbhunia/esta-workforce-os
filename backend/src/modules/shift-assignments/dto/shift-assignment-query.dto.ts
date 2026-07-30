import { ApiPropertyOptional } from '@nestjs/swagger';
import { ShiftAssignmentStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsOptional,
  IsUUID,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class ShiftAssignmentQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID()
  @IsOptional()
  employeeId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID()
  @IsOptional()
  shiftId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID()
  @IsOptional()
  branchId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID()
  @IsOptional()
  departmentId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID()
  @IsOptional()
  designationId?: string;

  @ApiPropertyOptional({ enum: ShiftAssignmentStatus })
  @IsEnum(ShiftAssignmentStatus)
  @IsOptional()
  status?: ShiftAssignmentStatus;

  @ApiPropertyOptional({
    format: 'date-time',
    description: 'Return assignments covering this timestamp using [from, to) semantics.',
  })
  @IsDateString({ strict: true })
  @IsOptional()
  effectiveAt?: string;

  @ApiPropertyOptional({ default: false })
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  @IsOptional()
  includeDeleted = false;
}

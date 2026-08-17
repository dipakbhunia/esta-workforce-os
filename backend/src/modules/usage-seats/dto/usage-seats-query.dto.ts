import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsOptional,
  IsUUID,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import {
  CommercialSeatSource,
  SeatCapacityState,
} from '../usage-seats.types';

const currentCommercialStatuses = ['ACTIVE', 'SUSPENDED'] as const;

export class UsageSeatsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: CommercialSeatSource })
  @IsEnum(CommercialSeatSource)
  @IsOptional()
  source?: CommercialSeatSource;

  @ApiPropertyOptional({ enum: currentCommercialStatuses })
  @IsIn(currentCommercialStatuses)
  @IsOptional()
  commercialStatus?: (typeof currentCommercialStatuses)[number];

  @ApiPropertyOptional({ enum: SeatCapacityState })
  @IsEnum(SeatCapacityState)
  @IsOptional()
  capacityState?: SeatCapacityState;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID()
  @IsOptional()
  planId?: string;

  @ApiPropertyOptional({ type: Boolean })
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  @IsBoolean()
  @IsOptional()
  overLimit?: boolean;
}

export class CompanySeatDetailsQueryDto extends PaginationQueryDto {}

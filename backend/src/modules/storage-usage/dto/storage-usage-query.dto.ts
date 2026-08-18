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
  CommercialStorageSource,
  StorageCapacityState,
} from '../storage-usage.types';

const currentCommercialStatuses = ['ACTIVE', 'SUSPENDED'] as const;

function optionalBoolean({ value }: { value: unknown }): unknown {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}

export class StorageUsageQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: CommercialStorageSource })
  @IsEnum(CommercialStorageSource)
  @IsOptional()
  source?: CommercialStorageSource;

  @ApiPropertyOptional({ enum: currentCommercialStatuses })
  @IsIn(currentCommercialStatuses)
  @IsOptional()
  commercialStatus?: (typeof currentCommercialStatuses)[number];

  @ApiPropertyOptional({ enum: StorageCapacityState })
  @IsEnum(StorageCapacityState)
  @IsOptional()
  capacityState?: StorageCapacityState;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID()
  @IsOptional()
  planId?: string;

  @ApiPropertyOptional({ type: Boolean })
  @Transform(optionalBoolean)
  @IsBoolean()
  @IsOptional()
  limitConfigured?: boolean;

  @ApiPropertyOptional({ type: Boolean })
  @Transform(optionalBoolean)
  @IsBoolean()
  @IsOptional()
  overLimit?: boolean;
}

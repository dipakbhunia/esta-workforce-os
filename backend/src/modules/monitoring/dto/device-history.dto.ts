import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export const deviceHistoryCategories = [
  'REGISTRATION',
  'SECURITY',
  'ASSIGNMENT',
  'MONITORING',
  'DEVICE',
  'SYSTEM',
] as const;

export type DeviceHistoryCategory = typeof deviceHistoryCategories[number];

export class DeviceHistoryQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100, description: 'Alias-compatible page size. Use limit or pageSize.' })
  @Transform(({ value, obj }) => Number(value ?? obj.pageSize ?? 20))
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  override limit = 20;

  @ApiPropertyOptional({ enum: deviceHistoryCategories })
  @IsIn(deviceHistoryCategories)
  @IsOptional()
  category?: DeviceHistoryCategory;

  @ApiPropertyOptional({ format: 'uuid', description: 'Filter by actor user ID' })
  @IsUUID()
  @IsOptional()
  actor?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsDateString()
  @IsOptional()
  dateFrom?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsDateString()
  @IsOptional()
  dateTo?: string;

}

export class DeviceHistoryActorDto {
  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  id!: string | null;

  @ApiProperty({ example: 'Demo Admin' })
  name!: string;

  @ApiPropertyOptional({ example: 'admin@demo.esta.local', nullable: true })
  email!: string | null;
}

export class DeviceHistoryItemDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'date-time' })
  occurredAt!: string;

  @ApiProperty({ type: DeviceHistoryActorDto })
  actor!: DeviceHistoryActorDto;

  @ApiProperty({ example: 'DEVICE_TRUSTED' })
  action!: string;

  @ApiProperty({ enum: deviceHistoryCategories })
  category!: DeviceHistoryCategory;

  @ApiProperty({ example: 'Device trusted' })
  title!: string;

  @ApiProperty({ example: 'Device was marked as trusted by Demo Admin.' })
  description!: string;

  @ApiPropertyOptional({ nullable: true, type: Object })
  metadata!: Record<string, unknown> | null;
}

export class DeviceHistoryPaginationDto {
  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  pageSize!: number;

  @ApiProperty({ example: 42 })
  total!: number;

  @ApiProperty({ example: 3 })
  totalPages!: number;
}

export class DeviceHistoryResponseDto {
  @ApiProperty({ type: [DeviceHistoryItemDto] })
  items!: DeviceHistoryItemDto[];

  @ApiProperty({ type: DeviceHistoryPaginationDto })
  pagination!: DeviceHistoryPaginationDto;
}

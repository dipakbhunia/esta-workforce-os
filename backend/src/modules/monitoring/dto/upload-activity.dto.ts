import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

class UsagePeriodDto {
  @ApiProperty({ format: 'date-time' })
  @IsDateString()
  startedAt!: string;

  @ApiProperty({ format: 'date-time' })
  @IsDateString()
  endedAt!: string;

  @ApiProperty({ minimum: 0, maximum: 86400 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(86400)
  durationSeconds!: number;
}

export class ApplicationUsageDto extends UsagePeriodDto {
  @ApiProperty({ example: 'Visual Studio Code' })
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  applicationName!: string;

  @ApiPropertyOptional({ example: 'monitoring.service.ts' })
  @IsString()
  @MaxLength(500)
  @IsOptional()
  windowTitle?: string;
}

export class WebsiteUsageDto extends UsagePeriodDto {
  @ApiPropertyOptional({ example: 'Chrome' })
  @IsString()
  @MaxLength(80)
  @IsOptional()
  browserName?: string;

  @ApiProperty({ example: 'docs.nestjs.com' })
  @IsString()
  @MinLength(1)
  @MaxLength(253)
  domain!: string;

  @ApiPropertyOptional({ example: 'https://docs.nestjs.com/controllers' })
  @IsString()
  @MaxLength(2048)
  @IsOptional()
  url?: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(500)
  @IsOptional()
  pageTitle?: string;
}

export class UploadActivityDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  deviceId!: string;

  @ApiProperty({ description: 'Electron-generated idempotency identifier' })
  @IsString()
  @MinLength(8)
  @MaxLength(120)
  clientSessionId!: string;

  @ApiProperty({ format: 'date-time' })
  @IsDateString()
  startedAt!: string;

  @ApiProperty({ format: 'date-time' })
  @IsDateString()
  endedAt!: string;

  @ApiProperty({ minimum: 0, maximum: 86400 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(86400)
  activeSeconds!: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 86400, default: 0 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(86400)
  @IsOptional()
  idleSeconds = 0;

  @ApiPropertyOptional({ minimum: 0 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1000000)
  @IsOptional()
  keystrokeCount?: number;

  @ApiPropertyOptional({ minimum: 0 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1000000)
  @IsOptional()
  keyboardCount?: number;

  @ApiPropertyOptional({ minimum: 0 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1000000)
  @IsOptional()
  mouseClickCount?: number;

  @ApiPropertyOptional({ minimum: 0 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1000000)
  @IsOptional()
  mouseMoveCount?: number;

  @ApiPropertyOptional({ minimum: 0 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1000000)
  @IsOptional()
  scrollCount?: number;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsObject()
  @IsOptional()
  metadata?: Record<string, unknown>;

  @ApiPropertyOptional({ type: [ApplicationUsageDto] })
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => ApplicationUsageDto)
  @IsOptional()
  applications?: ApplicationUsageDto[];

  @ApiPropertyOptional({ type: [WebsiteUsageDto] })
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => WebsiteUsageDto)
  @IsOptional()
  websites?: WebsiteUsageDto[];
}

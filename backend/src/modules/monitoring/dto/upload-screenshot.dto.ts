import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class UploadScreenshotDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  deviceId!: string;

  @ApiPropertyOptional({ description: 'Electron-generated idempotency identifier. Prefer clientCaptureId for new clients.' })
  @IsString()
  @MinLength(8)
  @MaxLength(120)
  @IsOptional()
  clientScreenshotId?: string;

  @ApiPropertyOptional({ description: 'Electron-generated idempotency identifier' })
  @IsString()
  @MinLength(8)
  @MaxLength(120)
  @IsOptional()
  clientCaptureId?: string;

  @ApiProperty({ format: 'date-time' })
  @IsDateString()
  capturedAt!: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID()
  @IsOptional()
  attendanceId?: string;

  @ApiPropertyOptional({ example: 'Visual Studio Code' })
  @IsString()
  @MaxLength(255)
  @IsOptional()
  applicationName?: string;

  @ApiPropertyOptional({ example: 'Esta Workforce OS - Monitoring' })
  @IsString()
  @MaxLength(512)
  @IsOptional()
  windowTitle?: string;

  @ApiProperty({ example: 'image/webp' })
  @IsString()
  @MinLength(3)
  @MaxLength(100)
  mimeType!: string;

  @ApiPropertyOptional({ minimum: 0 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  sizeBytes?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 16384 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(16384)
  @IsOptional()
  width?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 16384 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(16384)
  @IsOptional()
  height?: number;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(256)
  @IsOptional()
  checksum?: string;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @Transform(({ value }) => {
    if (typeof value !== 'string') return value;
    try {
      return JSON.parse(value) as Record<string, unknown>;
    } catch {
      return { raw: value };
    }
  })
  @IsOptional()
  metadata?: Record<string, unknown>;
}

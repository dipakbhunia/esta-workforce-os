import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
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
} from 'class-validator';

export class UploadScreenshotDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  deviceId!: string;

  @ApiProperty({ description: 'Electron-generated idempotency identifier' })
  @IsString()
  @MinLength(8)
  @MaxLength(120)
  clientScreenshotId!: string;

  @ApiProperty({ format: 'date-time' })
  @IsDateString()
  capturedAt!: string;

  @ApiProperty({
    example: 'companies/company-id/employees/employee-id/2026/06/image.webp',
    description: 'Future MinIO object key; this API does not upload image bytes.',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(1024)
  storageKey!: string;

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
  @IsObject()
  @IsOptional()
  metadata?: Record<string, unknown>;
}

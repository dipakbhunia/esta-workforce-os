import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateLeaveTypeDto {
  @ApiProperty({ example: 'Annual Leave' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name!: string;

  @ApiProperty({ example: 'ANNUAL' })
  @IsString()
  @MinLength(2)
  @MaxLength(30)
  @Matches(/^[A-Z][A-Z0-9_]*$/)
  code!: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(500)
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ default: 0, minimum: 0, maximum: 366 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(366)
  @IsOptional()
  defaultDays?: number;

  @ApiPropertyOptional({ default: true })
  @IsBoolean()
  @IsOptional()
  requiresApproval?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsBoolean()
  @IsOptional()
  managerCanApprove?: boolean;
}

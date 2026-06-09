import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateShiftDto {
  @ApiProperty({ example: 'General Shift' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @ApiProperty({ example: 'GENERAL' })
  @IsString()
  @MinLength(1)
  @MaxLength(30)
  @Matches(/^[A-Za-z0-9_-]+$/)
  code!: string;

  @ApiProperty({ example: '09:00', pattern: '^([01]\\d|2[0-3]):[0-5]\\d$' })
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  startTime!: string;

  @ApiProperty({ example: '18:00', pattern: '^([01]\\d|2[0-3]):[0-5]\\d$' })
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  endTime!: string;

  @ApiPropertyOptional({ example: 'Asia/Kolkata', default: 'UTC' })
  @IsString()
  @MaxLength(100)
  timezone = 'UTC';
}

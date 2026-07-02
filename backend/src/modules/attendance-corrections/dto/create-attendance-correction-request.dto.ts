import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AttendanceCorrectionType } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateAttendanceCorrectionRequestDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  attendanceId!: string;

  @ApiProperty({ enum: AttendanceCorrectionType })
  @IsEnum(AttendanceCorrectionType)
  type!: AttendanceCorrectionType;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsDateString()
  @IsOptional()
  requestedPunchInAt?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsDateString()
  @IsOptional()
  requestedPunchOutAt?: string;

  @ApiProperty({ maxLength: 1000 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  reason!: string;
}

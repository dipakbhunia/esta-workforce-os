import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateLeaveRequestDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  leaveTypeId!: string;

  @ApiProperty({ format: 'date', example: '2026-06-15' })
  @IsDateString({ strict: true })
  startDate!: string;

  @ApiProperty({ format: 'date', example: '2026-06-16' })
  @IsDateString({ strict: true })
  endDate!: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(1000)
  @IsOptional()
  reason?: string;
}

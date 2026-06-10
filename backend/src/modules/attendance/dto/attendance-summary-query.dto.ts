import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional } from 'class-validator';

export class AttendanceSummaryQueryDto {
  @ApiPropertyOptional({ format: 'date', description: 'Defaults to today in UTC' })
  @IsDateString({ strict: true })
  @IsOptional()
  date?: string;
}

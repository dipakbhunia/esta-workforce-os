import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional } from 'class-validator';

export class AttendanceSummaryQueryDto {
  @ApiPropertyOptional({
    format: 'date',
    description:
      'Defaults to the authenticated employee work date using the resolved shift timezone and attendance day start time.',
  })
  @IsDateString({ strict: true })
  @IsOptional()
  date?: string;
}

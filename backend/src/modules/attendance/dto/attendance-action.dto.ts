import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class AttendanceActionDto {
  @ApiPropertyOptional({ maxLength: 500 })
  @IsString()
  @MaxLength(500)
  @IsOptional()
  note?: string;
}

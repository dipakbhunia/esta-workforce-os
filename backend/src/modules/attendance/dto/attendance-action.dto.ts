import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class AttendanceActionDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Required when starting a break.',
  })
  @IsUUID()
  @IsOptional()
  breakPolicyId?: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsString()
  @MaxLength(500)
  @IsOptional()
  note?: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsString()
  @MaxLength(500)
  @IsOptional()
  comment?: string;
}

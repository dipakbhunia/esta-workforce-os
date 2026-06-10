import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UpdateRoleDto {
  @ApiPropertyOptional({ example: 'TEAM_LEAD' })
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  @Matches(/^[A-Z][A-Z0-9_]*$/)
  @IsOptional()
  key?: string;

  @ApiPropertyOptional({ example: 'Team Lead' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  @IsOptional()
  name?: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(500)
  @IsOptional()
  description?: string;
}

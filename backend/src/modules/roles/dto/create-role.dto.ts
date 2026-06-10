import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateRoleDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Super-admin only' })
  @IsUUID()
  @IsOptional()
  companyId?: string;

  @ApiProperty({ example: 'TEAM_LEAD' })
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  @Matches(/^[A-Z][A-Z0-9_]*$/)
  key!: string;

  @ApiProperty({ example: 'Team Lead' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name!: string;

  @ApiPropertyOptional({ enum: RoleName })
  @IsEnum(RoleName)
  @IsOptional()
  systemName?: RoleName;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(500)
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ type: [String], format: 'uuid' })
  @IsArray()
  @ArrayMaxSize(100)
  @IsUUID('4', { each: true })
  @IsOptional()
  permissionIds?: string[];
}

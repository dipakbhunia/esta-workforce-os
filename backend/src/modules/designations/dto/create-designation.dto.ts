import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateDesignationDto {
  @ApiProperty({ example: 'HR Manager' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @ApiProperty({ example: 'HR-MGR' })
  @IsString()
  @MinLength(1)
  @MaxLength(30)
  @Matches(/^[A-Za-z0-9_-]+$/)
  code!: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID()
  @IsOptional()
  departmentId?: string;
}

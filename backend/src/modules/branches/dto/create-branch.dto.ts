import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateBranchDto {
  @ApiProperty({ example: 'Head Office' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @ApiProperty({ example: 'HQ' })
  @IsString()
  @MinLength(1)
  @MaxLength(30)
  @Matches(/^[A-Za-z0-9_-]+$/)
  code!: string;

  @ApiPropertyOptional({ example: '123 Business Street' })
  @IsString()
  @MaxLength(500)
  @IsOptional()
  address?: string;
}

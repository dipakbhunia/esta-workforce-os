import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CompanyStatus } from '@prisma/client';
import {
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateCompanyDto {
  @ApiProperty({ example: 'Acme Corporation' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @ApiProperty({ example: 'acme-corporation' })
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  slug!: string;

  @ApiPropertyOptional({ enum: CompanyStatus, default: CompanyStatus.TRIAL })
  @IsEnum(CompanyStatus)
  @IsOptional()
  status?: CompanyStatus;
}

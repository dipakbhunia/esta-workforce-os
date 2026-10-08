import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { CompanyStatus } from '@prisma/client';
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsTimeZone,
  IsUrl,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class InitialCompanyAdminDto {
  @ApiProperty({ example: 'admin@acme.example' }) @IsEmail() @MaxLength(254) email!: string;
  @ApiProperty({ example: 'Asha' }) @IsString() @MinLength(1) @MaxLength(80) firstName!: string;
  @ApiProperty({ example: 'Sharma' }) @IsString() @MinLength(1) @MaxLength(80) lastName!: string;
}

export class CreateCompanyDto {
  @ApiPropertyOptional({ type: InitialCompanyAdminDto, description: 'Atomically provision and invite the initial Company Admin' })
  @ValidateNested()
  @Type(() => InitialCompanyAdminDto)
  @IsOptional()
  initialAdmin?: InitialCompanyAdminDto;

  @ApiProperty({ example: 'Acme Corporation' })
  @Transform(({ value }) => value === null ? '' : value)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @ApiProperty({ example: 'acme-corporation' })
  @Transform(({ value }) => value === null ? '' : value)
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  slug!: string;

  @ApiPropertyOptional({ example: 'people@acme.example', nullable: true })
  @IsEmail()
  @MaxLength(254)
  @IsOptional()
  primaryEmail?: string | null;

  @ApiPropertyOptional({ example: '+91 98765 43210', nullable: true })
  @IsString()
  @Matches(/^\+?[0-9][0-9 ()-]{6,19}$/)
  @IsOptional()
  phone?: string | null;

  @ApiPropertyOptional({ example: 'https://acme.example', nullable: true })
  @IsUrl({ require_protocol: true })
  @MaxLength(255)
  @IsOptional()
  website?: string | null;

  @ApiPropertyOptional({ example: 'India', nullable: true })
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  @IsOptional()
  country?: string | null;

  @ApiPropertyOptional({ example: 'Asia/Kolkata', default: 'UTC' })
  @Transform(({ value }) => value === null ? '' : value)
  @IsTimeZone()
  @MaxLength(100)
  @IsOptional()
  timezone?: string;

  @ApiPropertyOptional({ example: 'INR', nullable: true })
  @IsString()
  @Matches(/^[A-Z]{3}$/)
  @IsOptional()
  currency?: string | null;

  @ApiPropertyOptional({ example: '123 Business Street, Mumbai', nullable: true })
  @IsString()
  @MaxLength(500)
  @IsOptional()
  address?: string | null;

  @ApiPropertyOptional({ enum: CompanyStatus, default: CompanyStatus.TRIAL })
  @Transform(({ value }) => value === null ? '' : value)
  @IsEnum(CompanyStatus)
  @IsOptional()
  status?: CompanyStatus;
}

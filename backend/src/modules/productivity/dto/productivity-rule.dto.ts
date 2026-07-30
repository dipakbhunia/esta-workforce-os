import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { ProductivityCategory } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class ProductivityRuleQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ProductivityCategory })
  @IsEnum(ProductivityCategory)
  @IsOptional()
  category?: ProductivityCategory;

  @ApiPropertyOptional({ description: 'Filter enabled or disabled rules.' })
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') return undefined;
    if (value === true || value === 'true') return true;
    if (value === false || value === 'false') return false;
    return value;
  })
  @IsBoolean()
  @IsOptional()
  enabled?: boolean;

  @ApiPropertyOptional({ enum: ['GLOBAL', 'COMPANY'] })
  @IsString()
  @IsOptional()
  scope?: 'GLOBAL' | 'COMPANY';
}

export class CreateApplicationProductivityRuleDto {
  @ApiProperty({ example: 'Visual Studio Code' })
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  applicationName!: string;

  @ApiProperty({ enum: ProductivityCategory })
  @IsEnum(ProductivityCategory)
  category!: ProductivityCategory;

  @ApiPropertyOptional({ example: 'Engineering IDE' })
  @IsString()
  @MaxLength(500)
  @IsOptional()
  notes?: string;

  @ApiPropertyOptional({ default: true })
  @IsBoolean()
  @IsOptional()
  enabled?: boolean;

  @ApiPropertyOptional({ format: 'uuid', description: 'SUPER_ADMIN only. Omit for global default; provide for company override.' })
  @IsUUID()
  @IsOptional()
  companyId?: string;
}

export class UpdateApplicationProductivityRuleDto extends PartialType(CreateApplicationProductivityRuleDto) {}

export class CreateWebsiteProductivityRuleDto {
  @ApiProperty({ example: 'github.com', description: 'Hostname or URL. Only normalized hostname is stored for matching.' })
  @IsString()
  @MinLength(1)
  @MaxLength(253)
  hostname!: string;

  @ApiProperty({ enum: ProductivityCategory })
  @IsEnum(ProductivityCategory)
  category!: ProductivityCategory;

  @ApiPropertyOptional({ example: 'Developer collaboration' })
  @IsString()
  @MaxLength(500)
  @IsOptional()
  notes?: string;

  @ApiPropertyOptional({ default: true })
  @IsBoolean()
  @IsOptional()
  enabled?: boolean;

  @ApiPropertyOptional({ format: 'uuid', description: 'SUPER_ADMIN only. Omit for global default; provide for company override.' })
  @IsUUID()
  @IsOptional()
  companyId?: string;
}

export class UpdateWebsiteProductivityRuleDto extends PartialType(CreateWebsiteProductivityRuleDto) {}

export class ClassifyApplicationDto {
  @ApiProperty({ example: 'Code.exe' })
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  applicationName!: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Optional company context for testing override matching.' })
  @IsUUID()
  @IsOptional()
  companyId?: string;
}

export class ClassifyWebsiteDto {
  @ApiProperty({ example: 'https://www.github.com/openai?tab=repositories' })
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  hostname!: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Optional company context for testing override matching.' })
  @IsUUID()
  @IsOptional()
  companyId?: string;
}

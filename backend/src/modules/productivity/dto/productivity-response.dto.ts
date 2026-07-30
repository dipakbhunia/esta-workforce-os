import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProductivityCategory } from '@prisma/client';

export class ProductivityPaginationMetaDto {
  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  limit!: number;

  @ApiProperty({ example: 42 })
  total!: number;

  @ApiProperty({ example: 3 })
  totalPages!: number;
}

export class ApplicationProductivityRuleResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  companyId!: string | null;

  @ApiProperty({ enum: ['GLOBAL', 'COMPANY'] })
  scopeType!: 'GLOBAL' | 'COMPANY';

  @ApiProperty({ example: 'Visual Studio Code' })
  applicationName!: string;

  @ApiProperty({ example: 'visual studio code' })
  normalizedName!: string;

  @ApiProperty({ enum: ProductivityCategory })
  category!: ProductivityCategory;

  @ApiPropertyOptional({ nullable: true })
  notes!: string | null;

  @ApiProperty({ example: true })
  enabled!: boolean;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;
}

export class WebsiteProductivityRuleResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  companyId!: string | null;

  @ApiProperty({ enum: ['GLOBAL', 'COMPANY'] })
  scopeType!: 'GLOBAL' | 'COMPANY';

  @ApiProperty({ example: 'github.com' })
  hostname!: string;

  @ApiProperty({ example: 'github.com' })
  normalizedHostname!: string;

  @ApiProperty({ enum: ProductivityCategory })
  category!: ProductivityCategory;

  @ApiPropertyOptional({ nullable: true })
  notes!: string | null;

  @ApiProperty({ example: true })
  enabled!: boolean;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;
}

export class PaginatedApplicationProductivityRuleResponseDto {
  @ApiProperty({ type: [ApplicationProductivityRuleResponseDto] })
  data!: ApplicationProductivityRuleResponseDto[];

  @ApiProperty({ type: ProductivityPaginationMetaDto })
  meta!: ProductivityPaginationMetaDto;
}

export class PaginatedWebsiteProductivityRuleResponseDto {
  @ApiProperty({ type: [WebsiteProductivityRuleResponseDto] })
  data!: WebsiteProductivityRuleResponseDto[];

  @ApiProperty({ type: ProductivityPaginationMetaDto })
  meta!: ProductivityPaginationMetaDto;
}

export class ProductivityClassificationResponseDto {
  @ApiProperty({ enum: ProductivityCategory })
  category!: ProductivityCategory;

  @ApiProperty({ example: 'github.com' })
  normalizedValue!: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  ruleId!: string | null;

  @ApiProperty({ enum: ['GLOBAL', 'COMPANY', 'NONE'] })
  matchedScope!: 'GLOBAL' | 'COMPANY' | 'NONE';
}

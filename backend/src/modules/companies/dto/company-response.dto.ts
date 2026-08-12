import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CompanyStatus } from '@prisma/client';

export class CompanyCountsDto {
  @ApiProperty({ example: 3 })
  branches!: number;

  @ApiProperty({ example: 8 })
  departments!: number;

  @ApiProperty({ example: 12 })
  designations!: number;

  @ApiProperty({ example: 145 })
  employees!: number;

  @ApiProperty({ example: 150 })
  users!: number;
}

export class CompanyResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Acme Corporation' })
  name!: string;

  @ApiProperty({ example: 'acme-corporation' })
  slug!: string;

  @ApiPropertyOptional({ example: 'people@acme.example', nullable: true })
  primaryEmail!: string | null;

  @ApiPropertyOptional({ example: '+91 98765 43210', nullable: true })
  phone!: string | null;

  @ApiPropertyOptional({ example: 'https://acme.example', nullable: true })
  website!: string | null;

  @ApiPropertyOptional({ example: 'India', nullable: true })
  country!: string | null;

  @ApiProperty({ example: 'Asia/Kolkata' })
  timezone!: string;

  @ApiPropertyOptional({ example: 'INR', nullable: true })
  currency!: string | null;

  @ApiPropertyOptional({ example: '123 Business Street, Mumbai', nullable: true })
  address!: string | null;

  @ApiProperty({ enum: CompanyStatus })
  status!: CompanyStatus;

  @ApiProperty({ type: CompanyCountsDto })
  counts!: CompanyCountsDto;

  @ApiProperty({ format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: Date;
}

export class CompanyPaginationMetaDto {
  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  limit!: number;

  @ApiProperty({ example: 42 })
  total!: number;

  @ApiProperty({ example: 3 })
  totalPages!: number;
}

export class CompanyPaginatedResponseDto {
  @ApiProperty({ type: CompanyResponseDto, isArray: true })
  data!: CompanyResponseDto[];

  @ApiProperty({ type: CompanyPaginationMetaDto })
  meta!: CompanyPaginationMetaDto;
}

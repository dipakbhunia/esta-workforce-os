import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { BillingInterval, PlanBillingModel, PlanStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import { IsArray, IsBoolean, IsEnum, IsInt, IsObject, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

const requiredString = ({ value }: { value: unknown }) => value === null ? '' : value;

export class PlanRecurringPriceDto {
  @ApiProperty({ enum: [BillingInterval.MONTHLY, BillingInterval.YEARLY] })
  @IsEnum(BillingInterval)
  billingInterval!: BillingInterval;

  @ApiProperty({ description: 'Integer minor units as a decimal string', example: '9900' })
  @Transform(requiredString)
  @IsString()
  @Matches(/^\d+$/)
  amountMinor!: string;
}

export class CreatePlanDto {
  @ApiProperty({ example: 'STARTER' })
  @Transform(requiredString)
  @IsString() @MinLength(2) @MaxLength(50) @Matches(/^[A-Z][A-Z0-9_]*$/)
  code!: string;

  @ApiProperty({ example: 'Starter' })
  @Transform(requiredString)
  @IsString() @MinLength(2) @MaxLength(120)
  name!: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional() @IsString() @MaxLength(1000)
  description?: string | null;

  @ApiProperty({ enum: PlanBillingModel })
  @Transform(requiredString) @IsEnum(PlanBillingModel)
  billingModel!: PlanBillingModel;

  @ApiPropertyOptional({ example: 9900, nullable: true })
  @IsOptional() @IsInt() @Min(0)
  monthlyPricePerSeatMinor?: number | null;

  @ApiPropertyOptional({ type: [PlanRecurringPriceDto] })
  @IsOptional() @IsArray() @ValidateNested({ each: true })
  @Type(() => PlanRecurringPriceDto)
  recurringPrices?: PlanRecurringPriceDto[];

  @ApiProperty({ example: 'INR' })
  @Transform(requiredString) @IsString() @Matches(/^[A-Z]{3}$/)
  currency!: string;

  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsInt() @Min(0)
  minSeats?: number | null;

  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsInt() @Min(0)
  maxSeats?: number | null;

  @ApiPropertyOptional({ default: 0 }) @IsOptional() @IsInt() @Min(0) @Max(100000)
  sortOrder?: number;

  @ApiPropertyOptional({ default: false }) @IsOptional() @IsBoolean()
  isPublic?: boolean;

  @ApiPropertyOptional({ default: false }) @IsOptional() @IsBoolean()
  isRecommended?: boolean;

  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsString({ each: true })
  entitlements?: string[];

  @ApiPropertyOptional({ type: Object }) @IsOptional() @IsObject()
  limits?: Record<string, unknown>;
}

export class UpdatePlanDto extends PartialType(CreatePlanDto) {}

export class UpdatePlanStatusDto {
  @ApiProperty({ enum: PlanStatus })
  @Transform(requiredString) @IsEnum(PlanStatus)
  status!: PlanStatus;
}

export class PlanQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: PlanStatus }) @IsOptional() @IsEnum(PlanStatus)
  status?: PlanStatus;

  @ApiPropertyOptional() @IsOptional() @Type(() => Boolean) @IsBoolean()
  isPublic?: boolean;
}

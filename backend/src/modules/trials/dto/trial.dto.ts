import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BillingInterval, SubscriptionActivationSource, TrialStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import { IsArray, IsBoolean, IsDate, IsEnum, IsInt, IsNotEmpty, IsObject, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { MAX_TRIAL_DURATION_HOURS } from '../trial-policy';

export class StartTrialDto {
  @ApiProperty() @IsUUID() companyId!: string;
  @ApiPropertyOptional({ minimum: 1 }) @IsOptional() @IsInt() @Min(1) seatLimit?: number;
  @ApiPropertyOptional({ minimum: 1, maximum: MAX_TRIAL_DURATION_HOURS }) @IsOptional() @IsInt() @Min(1) @Max(MAX_TRIAL_DURATION_HOURS) durationHours?: number;
  @ApiPropertyOptional({ description: 'Required when this Company has prior Trial history.' }) @Transform(({ value }) => typeof value === 'string' ? value.trim() : value === null ? '' : value) @IsOptional() @IsString() @IsNotEmpty() @MaxLength(500) reason?: string;
  @ApiPropertyOptional({ type: Boolean }) @IsOptional() @IsBoolean() allowOverLimit?: boolean;
}

export class ExtendTrialDto {
  @ApiProperty({ minimum: 1, maximum: MAX_TRIAL_DURATION_HOURS }) @IsInt() @Min(1) @Max(MAX_TRIAL_DURATION_HOURS) durationHours!: number;
  @ApiProperty() @Transform(({ value }) => typeof value === 'string' ? value.trim() : value === null ? '' : value) @IsString() @IsNotEmpty() @MaxLength(500) reason!: string;
}

export class CancelTrialDto {
  @ApiProperty() @Transform(({ value }) => typeof value === 'string' ? value.trim() : value === null ? '' : value) @IsString() @IsNotEmpty() @MaxLength(500) reason!: string;
}

export class ConvertTrialDto {
  @ApiProperty() @IsUUID() planId!: string;
  @ApiProperty({ enum: BillingInterval }) @IsEnum(BillingInterval) billingInterval!: BillingInterval;
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) seatQuantity!: number;
  @ApiPropertyOptional({ minimum: 0, nullable: true }) @IsOptional() @IsInt() @Min(0) pricePerSeatMinor?: number | null;
  @ApiPropertyOptional({ minimum: 0, nullable: true }) @IsOptional() @IsInt() @Min(0) customRecurringPriceMinor?: number | null;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsString({ each: true }) entitlements?: string[];
  @ApiPropertyOptional({ type: Object }) @IsOptional() @IsObject() limits?: Record<string, unknown>;
  @ApiPropertyOptional({ type: Boolean }) @IsOptional() @IsBoolean() allowOverLimit?: boolean;
  @ApiPropertyOptional({ description: 'Required when approving capacity below current usage.' }) @Transform(({ value }) => typeof value === 'string' ? value.trim() : value) @IsOptional() @IsString() @IsNotEmpty() @MaxLength(500) reason?: string;
}

export class TrialQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: TrialStatus }) @IsOptional() @IsEnum(TrialStatus) status?: TrialStatus;
  @ApiPropertyOptional() @IsOptional() @IsUUID() companyId?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Date) @IsDate() startsFrom?: Date;
  @ApiPropertyOptional() @IsOptional() @Type(() => Date) @IsDate() startsTo?: Date;
  @ApiPropertyOptional() @IsOptional() @Type(() => Date) @IsDate() endsFrom?: Date;
  @ApiPropertyOptional() @IsOptional() @Type(() => Date) @IsDate() endsTo?: Date;
  @ApiPropertyOptional({ minimum: 1, maximum: 365 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(365) expiringWithinDays?: number;
}

export const TRIAL_CONVERSION_SOURCE = SubscriptionActivationSource.TRIAL_CONVERSION;

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BillingInterval, SubscriptionActivationSource, SubscriptionStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsArray, IsDate, IsEnum, IsInt, IsObject, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class CreateSubscriptionDto {
  @ApiProperty() @IsUUID() companyId!: string;
  @ApiProperty() @IsUUID() planId!: string;
  @ApiProperty({ enum: BillingInterval }) @IsEnum(BillingInterval) billingInterval!: BillingInterval;
  @ApiProperty({ enum: SubscriptionActivationSource }) @IsEnum(SubscriptionActivationSource) activationSource!: SubscriptionActivationSource;
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) seatQuantity!: number;
  @ApiPropertyOptional({ minimum: 0, nullable: true }) @IsOptional() @IsInt() @Min(0) pricePerSeatMinor?: number | null;
  @ApiPropertyOptional({ minimum: 0, nullable: true }) @IsOptional() @IsInt() @Min(0) customRecurringPriceMinor?: number | null;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsString({ each: true }) entitlements?: string[];
  @ApiPropertyOptional({ type: Object }) @IsOptional() @IsObject() limits?: Record<string, unknown>;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @Type(() => Date) @IsDate() startsAt?: Date | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @Type(() => Date) @IsDate() currentPeriodStart?: Date | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @Type(() => Date) @IsDate() currentPeriodEnd?: Date | null;
}

export class SubscriptionQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: SubscriptionStatus }) @IsOptional() @IsEnum(SubscriptionStatus) status?: SubscriptionStatus;
  @ApiPropertyOptional() @IsOptional() @IsUUID() companyId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() planId?: string;
  @ApiPropertyOptional({ enum: SubscriptionActivationSource }) @IsOptional() @IsEnum(SubscriptionActivationSource) activationSource?: SubscriptionActivationSource;
}

export class AmendSubscriptionDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() planId?: string;
  @ApiPropertyOptional({ enum: BillingInterval }) @IsOptional() @IsEnum(BillingInterval) billingInterval?: BillingInterval;
  @ApiPropertyOptional({ minimum: 1 }) @IsOptional() @IsInt() @Min(1) seatQuantity?: number;
  @ApiPropertyOptional({ minimum: 0, nullable: true }) @IsOptional() @IsInt() @Min(0) pricePerSeatMinor?: number | null;
  @ApiPropertyOptional({ minimum: 0, nullable: true }) @IsOptional() @IsInt() @Min(0) customRecurringPriceMinor?: number | null;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsString({ each: true }) entitlements?: string[];
  @ApiPropertyOptional({ type: Object }) @IsOptional() @IsObject() limits?: Record<string, unknown>;
}

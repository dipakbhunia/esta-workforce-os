import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BillingInterval, PlanBillingModel, PlanStatus, RecurringPriceBasis } from '@prisma/client';

export class PlanRecurringPriceResponseDto {
  @ApiProperty({ enum: BillingInterval }) billingInterval!: BillingInterval;
  @ApiProperty({ enum: RecurringPriceBasis }) basis!: RecurringPriceBasis;
  @ApiProperty({ description: 'Integer minor units as a decimal string' }) amountMinor!: string;
  @ApiProperty() currency!: string;
}

export class PlanResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional({ nullable: true }) description!: string | null;
  @ApiProperty({ enum: PlanStatus }) status!: PlanStatus;
  @ApiProperty({ enum: PlanBillingModel }) billingModel!: PlanBillingModel;
  @ApiPropertyOptional({ nullable: true }) monthlyPricePerSeatMinor!: number | null;
  @ApiProperty({ type: [PlanRecurringPriceResponseDto] }) recurringPrices!: PlanRecurringPriceResponseDto[];
  @ApiProperty() currency!: string;
  @ApiPropertyOptional({ nullable: true }) minSeats!: number | null;
  @ApiPropertyOptional({ nullable: true }) maxSeats!: number | null;
  @ApiProperty() sortOrder!: number;
  @ApiProperty() isPublic!: boolean;
  @ApiProperty() isRecommended!: boolean;
  @ApiProperty({ type: [String] }) entitlements!: string[];
  @ApiProperty({ type: Object }) limits!: Record<string, number>;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
  @ApiPropertyOptional({ nullable: true }) archivedAt!: Date | null;
}

export class PlanPaginatedResponseDto {
  @ApiProperty({ type: PlanResponseDto, isArray: true }) data!: PlanResponseDto[];
  @ApiProperty() meta!: { page: number; limit: number; total: number; totalPages: number };
}

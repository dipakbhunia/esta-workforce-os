import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, IsUUID, MaxLength, ValidateIf } from 'class-validator';

export class UpdateBillingContactDto {
  @ApiProperty({ format: 'uuid', nullable: true })
  @ValidateIf((_, value) => value !== null)
  @IsUUID('4')
  billingContactUserId!: string | null;
}

export class EligibleBillingContactQueryDto {
  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @Transform(({ value }) => typeof value === 'string' ? value.trim() || undefined : value)
  @IsString()
  @MaxLength(120)
  search?: string;
}

export class BillingContactIdentityDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() firstName!: string;
  @ApiProperty() lastName!: string;
  @ApiProperty({ format: 'email' }) email!: string;
}

export class BillingContactResponseDto {
  @ApiProperty({ format: 'uuid' }) companyId!: string;
  @ApiProperty() billingProfileExists!: boolean;
  @ApiProperty({ format: 'uuid', nullable: true }) billingContactUserId!: string | null;
  @ApiProperty({ type: BillingContactIdentityDto, nullable: true }) billingContact!: BillingContactIdentityDto | null;
}

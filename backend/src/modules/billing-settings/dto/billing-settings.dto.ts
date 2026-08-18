import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  InvoiceNumberResetPolicy,
  PaymentProviderMode,
  PaymentProviderType,
  RenewalMode,
} from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

const optionalText = ({ value }: { value: unknown }) => {
  if (value === null || value === undefined) return value;
  return typeof value === 'string' ? value.trim() || null : value;
};

const upperText = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;

export class UpdateBillingSettingsDto {
  @ApiPropertyOptional({ example: 'INV' })
  @Transform(upperText)
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MinLength(1)
  @MaxLength(20)
  @Matches(/^[A-Z0-9][A-Z0-9_/-]*$/)
  invoicePrefix?: string;

  @ApiPropertyOptional({ enum: InvoiceNumberResetPolicy })
  @ValidateIf((_object, value) => value !== undefined)
  @IsEnum(InvoiceNumberResetPolicy)
  invoiceNumberResetPolicy?: InvoiceNumberResetPolicy;

  @ApiPropertyOptional({ minimum: 0, maximum: 365 })
  @ValidateIf((_object, value) => value !== undefined)
  @IsInt()
  @Min(0)
  @Max(365)
  defaultPaymentTermsDays?: number;

  @ApiPropertyOptional({ nullable: true, maxLength: 2000 })
  @Transform(optionalText)
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  defaultInvoiceNotes?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 160 })
  @Transform(optionalText)
  @IsOptional()
  @IsString()
  @MaxLength(160)
  sellerLegalName?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @Transform(optionalText)
  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  sellerBillingEmail?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 240 })
  @Transform(optionalText)
  @IsOptional()
  @IsString()
  @MaxLength(240)
  sellerAddressLine1?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 240 })
  @Transform(optionalText)
  @IsOptional()
  @IsString()
  @MaxLength(240)
  sellerAddressLine2?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 100 })
  @Transform(optionalText)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  sellerCity?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 100 })
  @Transform(optionalText)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  sellerState?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 10 })
  @Transform(upperText)
  @IsOptional()
  @IsString()
  @MaxLength(10)
  @Matches(/^[A-Z0-9-]+$/)
  sellerStateCode?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 20 })
  @Transform(optionalText)
  @IsOptional()
  @IsString()
  @MaxLength(20)
  sellerPostalCode?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 80 })
  @Transform(optionalText)
  @IsOptional()
  @IsString()
  @MaxLength(80)
  sellerCountry?: string | null;

  @ApiPropertyOptional()
  @ValidateIf((_object, value) => value !== undefined)
  @IsBoolean()
  gstEnabled?: boolean;

  @ApiPropertyOptional({ nullable: true, example: '27ABCDE1234F1Z5' })
  @Transform(upperText)
  @IsOptional()
  @IsString()
  @Matches(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/)
  gstin?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 160 })
  @Transform(optionalText)
  @IsOptional()
  @IsString()
  @MaxLength(160)
  gstLegalName?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 100 })
  @Transform(optionalText)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  gstRegisteredState?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 10 })
  @Transform(upperText)
  @IsOptional()
  @IsString()
  @MaxLength(10)
  @Matches(/^[A-Z0-9-]+$/)
  gstRegisteredStateCode?: string | null;

  @ApiPropertyOptional({ enum: RenewalMode })
  @ValidateIf((_object, value) => value !== undefined)
  @IsEnum(RenewalMode)
  renewalMode?: RenewalMode;

  @ApiPropertyOptional({ minimum: 0, maximum: 365 })
  @ValidateIf((_object, value) => value !== undefined)
  @IsInt()
  @Min(0)
  @Max(365)
  renewalLeadDays?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 365 })
  @ValidateIf((_object, value) => value !== undefined)
  @IsInt()
  @Min(0)
  @Max(365)
  renewalGracePeriodDays?: number;

  @ApiPropertyOptional({ type: [Number], maxItems: 20 })
  @ValidateIf((_object, value) => value !== undefined)
  @IsArray()
  @ArrayMaxSize(20)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(365, { each: true })
  renewalReminderDays?: number[];
}

export class CreateBillingProviderConfigurationDto {
  @ApiProperty({ enum: PaymentProviderType })
  @IsEnum(PaymentProviderType)
  provider!: PaymentProviderType;

  @ApiProperty({ enum: PaymentProviderMode })
  @IsEnum(PaymentProviderMode)
  mode!: PaymentProviderMode;

  @ApiPropertyOptional({ nullable: true, maxLength: 120 })
  @Transform(optionalText)
  @IsOptional()
  @IsString()
  @MaxLength(120)
  displayName?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 255 })
  @Transform(optionalText)
  @IsOptional()
  @IsString()
  @MaxLength(255)
  accountReference?: string | null;
}

export class UpdateBillingProviderConfigurationDto {
  @ApiPropertyOptional({ enum: PaymentProviderMode })
  @ValidateIf((_object, value) => value !== undefined)
  @IsEnum(PaymentProviderMode)
  mode?: PaymentProviderMode;

  @ApiPropertyOptional({ nullable: true, maxLength: 120 })
  @Transform(optionalText)
  @IsOptional()
  @IsString()
  @MaxLength(120)
  displayName?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 255 })
  @Transform(optionalText)
  @IsOptional()
  @IsString()
  @MaxLength(255)
  accountReference?: string | null;
}

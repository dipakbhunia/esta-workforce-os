import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { GstJurisdictionClassification, GstTaxPolicyStatus, GstTaxTreatment } from '@prisma/client';
import { IsEnum, IsISO8601, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, Validate, ValidationArguments, ValidatorConstraint, ValidatorConstraintInterface } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

const trim = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;
const OFFSET_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/i;

@ValidatorConstraint({ name: 'gstDateRange', async: false })
class GstDateRangeConstraint implements ValidatorConstraintInterface {
  validate(_: unknown, args: ValidationArguments) { const value = args.object as { from?: string; to?: string }; if ((value.from === undefined) !== (value.to === undefined)) return false; return !value.from || Date.parse(value.from) < Date.parse(value.to!); }
  defaultMessage() { return 'from and to must be supplied together and from must be earlier than to'; }
}

@ValidatorConstraint({ name: 'gstSearchNotSupported', async: false })
class GstSearchNotSupportedConstraint implements ValidatorConstraintInterface {
  validate(value: unknown) { return value === undefined; }
  defaultMessage() { return 'search is not supported'; }
}

class NoSearchPaginationDto extends PaginationQueryDto {
  @Validate(GstSearchNotSupportedConstraint)
  declare search?: string;
}

export class PlatformGstPolicyQueryDto extends NoSearchPaginationDto {
  @IsEnum(GstTaxPolicyStatus) @IsOptional() status?: GstTaxPolicyStatus;
  @Transform(trim) @IsString() @Matches(/^INR$/) @IsOptional() currency?: string;
  @Transform(trim) @IsISO8601({ strict: true, strictSeparator: true }) @Matches(OFFSET_DATE_TIME) @IsOptional() effectiveAt?: string;
}

export class CreatePlatformGstPolicyDto {
  @ApiProperty() @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(64) @Matches(/^[A-Z][A-Z0-9_]*$/) policyCode!: string;
  @ApiProperty({ enum: GstTaxPolicyStatus }) @IsEnum(GstTaxPolicyStatus) status!: GstTaxPolicyStatus;
  @ApiProperty() @Transform(trim) @Matches(/^INR$/) currency!: string;
  @ApiProperty({ enum: GstTaxTreatment }) @IsEnum(GstTaxTreatment) treatment!: GstTaxTreatment;
  @ApiProperty() @Type(() => Number) @IsInt() @Min(0) @Max(10000) totalRateBasisPoints!: number;
  @ApiProperty() @Type(() => Number) @IsInt() @Min(0) @Max(10000) cgstRateBasisPoints!: number;
  @ApiProperty() @Type(() => Number) @IsInt() @Min(0) @Max(10000) sgstRateBasisPoints!: number;
  @ApiProperty() @Type(() => Number) @IsInt() @Min(0) @Max(10000) igstRateBasisPoints!: number;
  @ApiPropertyOptional() @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(64) @IsOptional() serviceClassification?: string;
  @ApiProperty() @Transform(trim) @IsISO8601({ strict: true, strictSeparator: true }) @Matches(OFFSET_DATE_TIME) effectiveFrom!: string;
  @ApiPropertyOptional() @Transform(trim) @IsISO8601({ strict: true, strictSeparator: true }) @Matches(OFFSET_DATE_TIME) @IsOptional() effectiveUntil?: string;
}

export class PlatformGstTransactionQueryDto extends NoSearchPaginationDto {
  @Transform(trim) @IsUUID() @IsOptional() companyId?: string;
  @IsEnum(GstTaxTreatment) @IsOptional() treatment?: GstTaxTreatment;
  @IsEnum(GstJurisdictionClassification) @IsOptional() jurisdiction?: GstJurisdictionClassification;
  @Transform(trim) @Matches(/^INR$/) @IsOptional() currency?: string;
  @Transform(trim) @IsUUID() @IsOptional() policyVersionId?: string;
  @Transform(trim) @IsISO8601({ strict: true, strictSeparator: true }) @Matches(OFFSET_DATE_TIME) @IsOptional() from?: string;
  @Transform(trim) @IsISO8601({ strict: true, strictSeparator: true }) @Matches(OFFSET_DATE_TIME) @IsOptional() to?: string;
  @Validate(GstDateRangeConstraint) private readonly dateRangeValidation?: never;
}

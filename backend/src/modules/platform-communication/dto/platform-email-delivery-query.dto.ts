import { ApiPropertyOptional } from '@nestjs/swagger';
import { NotificationStatus, NotificationType } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import { IsEmail, IsEnum, IsInt, IsISO8601, IsOptional, IsUUID, Matches, Max, MaxLength, Min, Validate, ValidationArguments, ValidatorConstraint, ValidatorConstraintInterface } from 'class-validator';

const trim = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;
const normalizeEmail = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim().toLowerCase() : value;
const OFFSET_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/i;

@ValidatorConstraint({ name: 'platformEmailDeliveryDateRange', async: false })
class PlatformEmailDeliveryDateRangeConstraint implements ValidatorConstraintInterface {
  validate(_: unknown, args: ValidationArguments): boolean {
    const query = args.object as PlatformEmailDeliveryQueryDto;
    if (!query.from || !query.to) return true;
    return Date.parse(query.from) < Date.parse(query.to);
  }
  defaultMessage(): string { return 'from must be earlier than to'; }
}

export class PlatformEmailDeliveryQueryDto {
  @ApiPropertyOptional({ default: 1 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page = 1;

  @ApiPropertyOptional({ default: 20, maximum: 100 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  limit = 20;

  @ApiPropertyOptional({ enum: NotificationStatus }) @IsOptional() @IsEnum(NotificationStatus)
  status?: NotificationStatus;

  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @Transform(trim) @IsUUID()
  companyId?: string;

  @ApiPropertyOptional({ format: 'email' }) @IsOptional() @Transform(normalizeEmail) @IsEmail() @MaxLength(254)
  recipient?: string;

  @ApiPropertyOptional({ enum: NotificationType }) @IsOptional() @IsEnum(NotificationType)
  eventType?: NotificationType;

  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsISO8601({ strict: true, strictSeparator: true }) @Matches(OFFSET_DATE_TIME)
  from?: string;

  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsISO8601({ strict: true, strictSeparator: true }) @Matches(OFFSET_DATE_TIME)
  to?: string;

  @Validate(PlatformEmailDeliveryDateRangeConstraint)
  private readonly dateRangeValidation?: never;
}

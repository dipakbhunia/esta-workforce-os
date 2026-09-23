import { ApiPropertyOptional } from '@nestjs/swagger';
import { BillingInterval, SubscriptionRenewalStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsEnum, IsISO8601, IsNotEmpty, IsOptional, IsString, IsUUID, Matches,
  Validate, ValidationArguments, ValidatorConstraint, ValidatorConstraintInterface,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

const trim = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;
const OFFSET_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/i;

function isStrictInstant(value: string): boolean {
  if (!OFFSET_DATE_TIME.test(value)) return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/.exec(value);
  if (!match) return false;
  const [, year, month, day, hour, minute, second] = match.map(Number);
  if (month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59) return false;
  return day >= 1 && day <= new Date(Date.UTC(year, month, 0)).getUTCDate() && Number.isFinite(Date.parse(value));
}

@ValidatorConstraint({ name: 'platformRenewalDateRange', async: false })
class PlatformRenewalDateRangeConstraint implements ValidatorConstraintInterface {
  validate(_: unknown, args: ValidationArguments): boolean {
    const query = args.object as PlatformRenewalQueryDto;
    if ((query.from === undefined) !== (query.to === undefined)) return false;
    if (!query.from || !query.to) return true;
    return isStrictInstant(query.from) && isStrictInstant(query.to) && Date.parse(query.from) < Date.parse(query.to);
  }
  defaultMessage(): string { return 'from and to must be valid offset datetimes supplied together, with from earlier than to'; }
}

@ValidatorConstraint({ name: 'renewalSearchNotSupported', async: false })
class SearchNotSupportedConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean { return value === undefined; }
  defaultMessage(): string { return 'search is not supported'; }
}

export class PlatformRenewalQueryDto extends PaginationQueryDto {
  @Validate(SearchNotSupportedConstraint)
  declare search?: string;

  @ApiPropertyOptional({ format: 'uuid' }) @Transform(trim) @IsString() @IsNotEmpty() @IsUUID() @IsOptional()
  companyId?: string;
  @ApiPropertyOptional({ format: 'uuid' }) @Transform(trim) @IsString() @IsNotEmpty() @IsUUID() @IsOptional()
  subscriptionId?: string;
  @ApiPropertyOptional({ format: 'uuid' }) @Transform(trim) @IsString() @IsNotEmpty() @IsUUID() @IsOptional()
  paymentId?: string;
  @ApiPropertyOptional({ enum: SubscriptionRenewalStatus }) @Transform(trim) @IsEnum(SubscriptionRenewalStatus) @IsOptional()
  status?: SubscriptionRenewalStatus;
  @ApiPropertyOptional({ enum: BillingInterval }) @Transform(trim) @IsEnum(BillingInterval) @IsOptional()
  billingInterval?: BillingInterval;
  @ApiPropertyOptional() @Transform(trim) @IsISO8601({ strict: true, strictSeparator: true }) @Matches(OFFSET_DATE_TIME) @IsOptional()
  from?: string;
  @ApiPropertyOptional() @Transform(trim) @IsISO8601({ strict: true, strictSeparator: true }) @Matches(OFFSET_DATE_TIME) @IsOptional()
  to?: string;

  @Validate(PlatformRenewalDateRangeConstraint)
  private readonly dateRangeValidation?: never;
}

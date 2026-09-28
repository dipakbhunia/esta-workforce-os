import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsISO8601, IsNotEmpty, IsOptional, IsString, IsUUID, Matches, Max, Min, Validate, ValidationArguments, ValidatorConstraint, ValidatorConstraintInterface } from 'class-validator';

const trim = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;
const strictDecimalInteger = ({ value }: { value: unknown }): number => {
  if (typeof value === 'number') return Number.isSafeInteger(value) ? value : Number.NaN;
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return Number.NaN;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : Number.NaN;
};
const OFFSET_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/i;
export const DUNNING_ACTIVE_PAYMENT_STATUSES = [PaymentStatus.PENDING, PaymentStatus.AUTHORIZED, PaymentStatus.FAILED] as const;

function isStrictInstant(value: string): boolean {
  if (!OFFSET_DATE_TIME.test(value)) return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/.exec(value);
  if (!match) return false;
  const [, year, month, day, hour, minute, second] = match.map(Number);
  if (month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59) return false;
  return day >= 1 && day <= new Date(Date.UTC(year, month, 0)).getUTCDate() && Number.isFinite(Date.parse(value));
}

@ValidatorConstraint({ name: 'platformDunningDateRange', async: false })
class PlatformDunningDateRangeConstraint implements ValidatorConstraintInterface {
  validate(_: unknown, args: ValidationArguments): boolean {
    const query = args.object as PlatformDunningQueryDto;
    if ((query.from === undefined) !== (query.to === undefined)) return false;
    if (!query.from || !query.to) return true;
    return isStrictInstant(query.from) && isStrictInstant(query.to) && Date.parse(query.from) < Date.parse(query.to);
  }
  defaultMessage(): string { return 'from and to must be valid offset datetimes supplied together, with from earlier than to'; }
}

export class PlatformDunningQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 }) @Transform(strictDecimalInteger) @IsInt() @Min(1) @Max(Number.MAX_SAFE_INTEGER) @IsOptional()
  page = 1;
  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 }) @Transform(strictDecimalInteger) @IsInt() @Min(1) @Max(100) @IsOptional()
  limit = 20;

  @ApiPropertyOptional({ format: 'uuid' }) @Transform(trim) @IsString() @IsNotEmpty() @IsUUID() @IsOptional()
  companyId?: string;
  @ApiPropertyOptional({ format: 'uuid' }) @Transform(trim) @IsString() @IsNotEmpty() @IsUUID() @IsOptional()
  subscriptionId?: string;
  @ApiPropertyOptional({ format: 'uuid' }) @Transform(trim) @IsString() @IsNotEmpty() @IsUUID() @IsOptional()
  renewalId?: string;
  @ApiPropertyOptional({ format: 'uuid' }) @Transform(trim) @IsString() @IsNotEmpty() @IsUUID() @IsOptional()
  paymentId?: string;
  @ApiPropertyOptional({ enum: DUNNING_ACTIVE_PAYMENT_STATUSES }) @Transform(trim) @IsIn(DUNNING_ACTIVE_PAYMENT_STATUSES) @IsOptional()
  paymentStatus?: (typeof DUNNING_ACTIVE_PAYMENT_STATUSES)[number];
  @ApiPropertyOptional() @Transform(trim) @IsISO8601({ strict: true, strictSeparator: true }) @Matches(OFFSET_DATE_TIME) @IsOptional()
  from?: string;
  @ApiPropertyOptional() @Transform(trim) @IsISO8601({ strict: true, strictSeparator: true }) @Matches(OFFSET_DATE_TIME) @IsOptional()
  to?: string;

  @Validate(PlatformDunningDateRangeConstraint)
  private readonly dateRangeValidation?: never;
}

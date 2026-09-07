import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  PaymentProviderMode,
  PaymentProviderType,
  PaymentPurpose,
  PaymentStatus,
} from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsISO8601,
  IsString,
  IsUUID,
  Matches,
  Validate,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const OFFSET_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/i;

@ValidatorConstraint({ name: 'platformPaymentDateRange', async: false })
class PlatformPaymentDateRangeConstraint implements ValidatorConstraintInterface {
  validate(_: unknown, args: ValidationArguments): boolean {
    const query = args.object as PlatformPaymentQueryDto;
    if ((query.from === undefined) !== (query.to === undefined)) return false;
    if (query.from === undefined || query.to === undefined) return true;
    const from = Date.parse(query.from);
    const to = Date.parse(query.to);
    return Number.isFinite(from) && Number.isFinite(to) && from < to;
  }

  defaultMessage(): string {
    return 'from and to must be supplied together and from must be earlier than to';
  }
}

@ValidatorConstraint({ name: 'searchNotSupported', async: false })
class SearchNotSupportedConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return value === undefined;
  }

  defaultMessage(): string {
    return 'search is not supported';
  }
}

export class PlatformPaymentQueryDto extends PaginationQueryDto {
  @Validate(SearchNotSupportedConstraint)
  declare search?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @IsUUID()
  @IsOptional()
  companyId?: string;

  @ApiPropertyOptional({ enum: PaymentStatus })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @IsEnum(PaymentStatus)
  @IsOptional()
  status?: PaymentStatus;

  @ApiPropertyOptional({ enum: PaymentProviderType })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @IsEnum(PaymentProviderType)
  @IsOptional()
  provider?: PaymentProviderType;

  @ApiPropertyOptional({ enum: PaymentProviderMode })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @IsEnum(PaymentProviderMode)
  @IsOptional()
  mode?: PaymentProviderMode;

  @ApiPropertyOptional({ enum: PaymentPurpose })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @IsEnum(PaymentPurpose)
  @IsOptional()
  purpose?: PaymentPurpose;

  @ApiPropertyOptional({ format: 'uuid' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @IsUUID()
  @IsOptional()
  subscriptionId?: string;

  @ApiPropertyOptional({ example: '2026-09-01T00:00:00Z' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @IsISO8601({ strict: true, strictSeparator: true })
  @Matches(OFFSET_DATE_TIME, { message: 'from must be an ISO-8601 datetime with an explicit offset' })
  @IsOptional()
  from?: string;

  @ApiPropertyOptional({ example: '2026-10-01T00:00:00+05:30' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @IsISO8601({ strict: true, strictSeparator: true })
  @Matches(OFFSET_DATE_TIME, { message: 'to must be an ISO-8601 datetime with an explicit offset' })
  @IsOptional()
  to?: string;

  @Validate(PlatformPaymentDateRangeConstraint)
  private readonly dateRangeValidation?: never;
}

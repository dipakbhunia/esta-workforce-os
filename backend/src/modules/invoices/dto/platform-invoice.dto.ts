import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Validate,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const OFFSET_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/i;

@ValidatorConstraint({ name: 'platformInvoiceDateRange', async: false })
class PlatformInvoiceDateRangeConstraint implements ValidatorConstraintInterface {
  validate(_: unknown, args: ValidationArguments): boolean {
    const query = args.object as PlatformInvoiceQueryDto;
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

@ValidatorConstraint({ name: 'invoiceSearchNotSupported', async: false })
class SearchNotSupportedConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return value === undefined;
  }

  defaultMessage(): string {
    return 'search is not supported';
  }
}

export class IssuePlatformInvoiceDto {
  @ApiProperty({ format: 'uuid' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @IsUUID()
  paymentId!: string;
}

export class PlatformInvoiceQueryDto extends PaginationQueryDto {
  @Validate(SearchNotSupportedConstraint)
  declare search?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @IsUUID()
  @IsOptional()
  companyId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @IsUUID()
  @IsOptional()
  subscriptionId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @IsUUID()
  @IsOptional()
  sourcePaymentId?: string;

  @ApiPropertyOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @IsOptional()
  invoiceNumber?: string;

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

  @Validate(PlatformInvoiceDateRangeConstraint)
  private readonly dateRangeValidation?: never;
}

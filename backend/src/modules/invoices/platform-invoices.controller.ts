import {
  Body,
  ConflictException,
  Controller,
  Get,
  InternalServerErrorException,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { IssuePlatformInvoiceDto, PlatformInvoiceQueryDto } from './dto/platform-invoice.dto';
import { InvoiceIssuanceError, InvoiceIssuanceService } from './invoice-issuance.service';
import { PlatformInvoicesService } from './platform-invoices.service';

const CONFLICT_CODES = new Set([
  'WRONG_PAYMENT_PURPOSE', 'PAYMENT_NOT_CAPTURED', 'CAPTURE_EVIDENCE_MISSING',
  'INVALID_PAYMENT_AMOUNT', 'OWNERSHIP_MISMATCH', 'ACTIVATION_LINK_MISMATCH',
  'COMMERCIAL_SNAPSHOT_INVALID', 'COMMERCIAL_MISMATCH',
]);
const AUTHORITY_CODES = new Set([
  'BILLING_SETTINGS_MISSING', 'BILLING_PROFILE_INCOMPLETE', 'SELLER_PROFILE_INCOMPLETE',
  'REQUIRED_TEXT_MISSING', 'INVALID_INVOICE_PREFIX', 'INVALID_RESET_POLICY',
  'SERVICE_PERIOD_INVALID',
]);

export function mapInvoiceIssuanceError(error: unknown): Error {
  if (!(error instanceof InvoiceIssuanceError)) {
    return new InternalServerErrorException('Invoice issuance failed');
  }
  if (error.code === 'PAYMENT_NOT_FOUND') return new NotFoundException(error.message);
  if (CONFLICT_CODES.has(error.code)) return new ConflictException(error.message);
  if (AUTHORITY_CODES.has(error.code)) return new UnprocessableEntityException(error.message);
  return new InternalServerErrorException('Invoice issuance failed');
}

@ApiTags('Platform Invoices')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleName.SUPER_ADMIN)
@Controller('platform/invoices')
export class PlatformInvoicesController {
  constructor(
    private readonly issuance: InvoiceIssuanceService,
    private readonly invoices: PlatformInvoicesService,
  ) {}

  @Post()
  async issue(@Body() dto: IssuePlatformInvoiceDto, @CurrentUser() actor: AuthenticatedUser) {
    try {
      return await this.issuance.issue(dto.paymentId, actor.id);
    } catch (error) {
      throw mapInvoiceIssuanceError(error);
    }
  }

  @Get()
  findAll(@Query() query: PlatformInvoiceQueryDto) {
    return this.invoices.findAll(query);
  }

  @Get(':invoiceId')
  findOne(@Param('invoiceId', ParseUUIDPipe) invoiceId: string) {
    return this.invoices.findOne(invoiceId);
  }
}

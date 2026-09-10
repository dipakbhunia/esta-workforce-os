import { Module } from '@nestjs/common';
import { InvoiceGenerationService } from './invoice-generation.service';
import { InvoiceIssuanceService } from './invoice-issuance.service';
import { PlatformInvoicesController } from './platform-invoices.controller';
import { PlatformInvoicesService } from './platform-invoices.service';

@Module({
  controllers: [PlatformInvoicesController],
  providers: [InvoiceIssuanceService, InvoiceGenerationService, PlatformInvoicesService],
  exports: [InvoiceIssuanceService, InvoiceGenerationService],
})
export class InvoiceFoundationModule {}

import { Module } from '@nestjs/common';
import { InvoiceIssuanceService } from './invoice-issuance.service';
import { PlatformInvoicesController } from './platform-invoices.controller';
import { PlatformInvoicesService } from './platform-invoices.service';

@Module({
  controllers: [PlatformInvoicesController],
  providers: [InvoiceIssuanceService, PlatformInvoicesService],
  exports: [InvoiceIssuanceService],
})
export class InvoiceFoundationModule {}

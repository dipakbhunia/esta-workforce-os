import { Module } from '@nestjs/common';
import { InvoiceGenerationRecoveryScheduler } from './invoice-generation-recovery.scheduler';
import { InvoiceGenerationRecoveryService } from './invoice-generation-recovery.service';
import { InvoiceGenerationService } from './invoice-generation.service';
import { InvoiceIssuanceService } from './invoice-issuance.service';
import { PlatformInvoicesController } from './platform-invoices.controller';
import { PlatformInvoicesService } from './platform-invoices.service';

@Module({
  controllers: [PlatformInvoicesController],
  providers: [
    InvoiceIssuanceService,
    InvoiceGenerationService,
    InvoiceGenerationRecoveryService,
    InvoiceGenerationRecoveryScheduler,
    PlatformInvoicesService,
  ],
  exports: [InvoiceIssuanceService, InvoiceGenerationService],
})
export class InvoiceFoundationModule {}

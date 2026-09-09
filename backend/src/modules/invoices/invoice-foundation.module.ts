import { Module } from '@nestjs/common';
import { InvoiceIssuanceService } from './invoice-issuance.service';

@Module({ providers: [InvoiceIssuanceService], exports: [InvoiceIssuanceService] })
export class InvoiceFoundationModule {}

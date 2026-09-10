import { Injectable, Logger } from '@nestjs/common';
import { InvoiceIssuanceError, InvoiceIssuanceService } from './invoice-issuance.service';

export type InvoiceGenerationResult =
  | { outcome: 'ISSUED' }
  | { outcome: 'FAILED'; category: string };

@Injectable()
export class InvoiceGenerationService {
  private readonly logger = new Logger(InvoiceGenerationService.name);

  constructor(private readonly issuance: InvoiceIssuanceService) {}

  async generate(sourcePaymentId: string): Promise<InvoiceGenerationResult> {
    try {
      await this.issuance.issue(sourcePaymentId);
      return { outcome: 'ISSUED' };
    } catch (error) {
      const category = error instanceof InvoiceIssuanceError ? error.code : 'INTERNAL_ERROR';
      this.logger.error(`Automatic invoice generation failed for Payment ${sourcePaymentId}: ${category}`);
      return { outcome: 'FAILED', category };
    }
  }
}

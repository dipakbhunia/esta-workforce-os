import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { InvoiceGenerationService } from './invoice-generation.service';

export type InvoiceGenerationRecoverySummary = {
  scanned: number;
  succeeded: number;
  failed: number;
};

@Injectable()
export class InvoiceGenerationRecoveryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly generation: InvoiceGenerationService,
  ) {}

  async recoverDue(limit = 25): Promise<InvoiceGenerationRecoverySummary> {
    const take = Math.min(Math.max(Number.isInteger(limit) ? limit : 25, 1), 100);
    const candidates = await this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT payment."id"
      FROM "Payment" payment
      INNER JOIN "CompanySubscription" subscription
        ON subscription."id" = payment."subscriptionId"
       AND subscription."companyId" = payment."companyId"
       AND subscription."activatedByPaymentId" = payment."id"
      WHERE payment."purpose" = 'SUBSCRIPTION_ACTIVATION'
        AND payment."status" = 'CAPTURED'
        AND payment."capturedAt" IS NOT NULL
        AND payment."capturedProviderPaymentId" IS NOT NULL
        AND BTRIM(payment."capturedProviderPaymentId") <> ''
        AND subscription."activationSource" = 'PAYMENT'
        AND subscription."status" IN ('ACTIVE', 'SUSPENDED')
        AND subscription."currentPeriodStart" IS NOT NULL
        AND subscription."currentPeriodEnd" IS NOT NULL
        AND subscription."currentPeriodStart" < subscription."currentPeriodEnd"
        AND NOT EXISTS (
          SELECT 1 FROM "Invoice" invoice WHERE invoice."sourcePaymentId" = payment."id"
        )
      ORDER BY payment."createdAt" ASC, payment."id" ASC
      LIMIT ${take}`);

    let succeeded = 0;
    let failed = 0;
    const attempted = new Set<string>();
    for (const candidate of candidates) {
      if (attempted.has(candidate.id)) continue;
      attempted.add(candidate.id);
      try {
        const result = await this.generation.generate(candidate.id);
        if (result.outcome === 'ISSUED') succeeded += 1;
        else failed += 1;
      } catch {
        failed += 1;
      }
    }
    return { scanned: attempted.size, succeeded, failed };
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { Prisma, SubscriptionStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { SeatUsageService } from '../usage-seats/seat-usage.service';
import { isSubscriptionPeriodDue } from './subscription-period-validity.util';

export type SubscriptionExpirationSource = 'MANUAL' | 'SCHEDULER';
export type SubscriptionExpirationOutcome =
  | 'EXPIRED'
  | 'ALREADY_EXPIRED'
  | 'NOT_DUE'
  | 'NOT_ELIGIBLE'
  | 'NOT_FOUND';

export interface SubscriptionExpirationResult {
  outcome: SubscriptionExpirationOutcome;
  subscriptionId: string;
}

@Injectable()
export class SubscriptionExpirationService {
  private readonly logger = new Logger(SubscriptionExpirationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly seatUsage: SeatUsageService,
  ) {}

  async expire(
    subscriptionId: string,
    options: {
      now: Date;
      source: SubscriptionExpirationSource;
      actorUserId?: string | null;
    },
  ): Promise<SubscriptionExpirationResult> {
    const identity = await this.prisma.companySubscription.findUnique({
      where: { id: subscriptionId },
      select: { companyId: true },
    });
    if (!identity) return { outcome: 'NOT_FOUND', subscriptionId };

    return this.prisma.$transaction(async (tx) => {
      await this.seatUsage.lockCompany(tx, identity.companyId);
      const current = await tx.companySubscription.findUnique({ where: { id: subscriptionId } });
      if (!current || current.companyId !== identity.companyId) {
        return { outcome: 'NOT_FOUND' as const, subscriptionId };
      }
      if (current.status === SubscriptionStatus.EXPIRED) {
        return { outcome: 'ALREADY_EXPIRED' as const, subscriptionId };
      }
      if (current.status !== SubscriptionStatus.ACTIVE && current.status !== SubscriptionStatus.SUSPENDED) {
        return { outcome: 'NOT_ELIGIBLE' as const, subscriptionId };
      }
      if (!isSubscriptionPeriodDue(current, options.now)) {
        return { outcome: 'NOT_DUE' as const, subscriptionId };
      }

      const periodEnd = current.currentPeriodEnd!;
      await tx.companySubscription.update({
        where: { id: subscriptionId },
        data: { status: SubscriptionStatus.EXPIRED, endedAt: periodEnd },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: options.actorUserId ?? null,
          companyId: current.companyId,
          action: 'SUBSCRIPTION_EXPIRED',
          entityType: 'CompanySubscription',
          entityId: current.id,
          metadata: {
            subscriptionId: current.id,
            from: current.status,
            to: SubscriptionStatus.EXPIRED,
            currentPeriodEnd: periodEnd.toISOString(),
            expirationSource: options.source,
          },
        },
      });
      return { outcome: 'EXPIRED' as const, subscriptionId };
    });
  }

  async recoverDue(limit = 25, scanNow = new Date()): Promise<number> {
    const take = Math.min(Math.max(Math.trunc(limit), 1), 100);
    const candidates = await this.prisma.companySubscription.findMany({
      where: {
        status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.SUSPENDED] },
        currentPeriodEnd: { not: null, lte: scanNow },
      },
      select: { id: true, companyId: true, currentPeriodEnd: true },
      orderBy: [{ currentPeriodEnd: 'asc' }, { id: 'asc' }],
      take,
    });
    let expired = 0;
    for (const candidate of candidates) {
      try {
        const result = await this.expire(candidate.id, { now: scanNow, source: 'SCHEDULER' });
        if (result.outcome === 'EXPIRED') expired += 1;
      } catch (error) {
        this.logger.warn(`Subscription expiration failed for ${candidate.id}: ${error instanceof Error ? error.message : 'unknown error'}`);
      }
    }
    return expired;
  }
}

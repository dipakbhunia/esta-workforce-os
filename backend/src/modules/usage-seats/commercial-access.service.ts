import { Injectable } from '@nestjs/common';
import {
  Prisma,
  SubscriptionStatus,
  TrialStatus,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import {
  CommercialSeatAccess,
  CommercialSeatSource,
} from './usage-seats.types';

@Injectable()
export class CommercialAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(
    companyId: string,
    client: Prisma.TransactionClient = this.prisma,
    now = new Date(),
  ): Promise<CommercialSeatAccess> {
    const trial = await client.companyTrial.findFirst({
      where: {
        companyId,
        status: TrialStatus.ACTIVE,
        startsAt: { lte: now },
        endsAt: { gt: now },
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true, status: true, seatLimit: true },
    });

    if (trial) {
      return {
        source: CommercialSeatSource.TRIAL,
        referenceId: trial.id,
        commercialStatus: trial.status,
        plan: null,
        capacity: trial.seatLimit,
        allocationAllowed: true,
      };
    }

    const subscription = await client.companySubscription.findFirst({
      where: {
        companyId,
        status: {
          in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.SUSPENDED],
        },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        status: true,
        seatQuantity: true,
        plan: { select: { id: true, code: true, name: true } },
      },
    });

    if (subscription) {
      return {
        source: CommercialSeatSource.SUBSCRIPTION,
        referenceId: subscription.id,
        commercialStatus: subscription.status,
        plan: subscription.plan,
        capacity: subscription.seatQuantity,
        allocationAllowed: subscription.status === SubscriptionStatus.ACTIVE,
      };
    }

    return {
      source: CommercialSeatSource.NONE,
      referenceId: null,
      commercialStatus: null,
      plan: null,
      capacity: null,
      allocationAllowed: false,
    };
  }
}

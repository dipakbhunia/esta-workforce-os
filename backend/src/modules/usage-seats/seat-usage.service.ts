import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  EmployeeStatus,
  Prisma,
  SubscriptionStatus,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import {
  CommercialSeatAccess,
  CommercialSeatSource,
  SeatCalculation,
  SeatCapacityState,
} from './usage-seats.types';

export interface OverLimitOverride {
  allowOverLimit?: boolean;
  reason?: string;
}

export interface ApprovedOverLimit {
  usedSeats: number;
  proposedCapacity: number;
  overBy: number;
  allowOverLimit: true;
  reason: string;
}

@Injectable()
export class SeatUsageService {
  constructor(private readonly prisma: PrismaService) {}

  async lockCompany(
    tx: Prisma.TransactionClient,
    companyId: string,
  ): Promise<void> {
    const rows = await tx.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`SELECT "id" FROM "Company" WHERE "id" = ${companyId}::uuid FOR UPDATE`,
    );
    if (!rows.length) throw new NotFoundException('Company not found');
  }

  countUsedSeats(
    companyId: string,
    client: Prisma.TransactionClient = this.prisma,
  ): Promise<number> {
    return client.employee.count({
      where: {
        companyId,
        status: EmployeeStatus.ACTIVE,
        deletedAt: null,
      },
    });
  }

  calculate(
    used: number,
    capacity: number | null,
  ): SeatCalculation {
    if (capacity === null) {
      return {
        used,
        remaining: null,
        overBy: null,
        utilizationPercent: null,
        isOverLimit: null,
        capacityState: SeatCapacityState.NO_ACCESS,
      };
    }

    const isOverLimit = used > capacity;
    const capacityState = isOverLimit
      ? SeatCapacityState.OVER_LIMIT
      : used === capacity
        ? SeatCapacityState.AT_CAPACITY
        : SeatCapacityState.AVAILABLE;

    return {
      used,
      remaining: Math.max(capacity - used, 0),
      overBy: Math.max(used - capacity, 0),
      utilizationPercent: Math.round((used / capacity) * 10_000) / 100,
      isOverLimit,
      capacityState,
    };
  }

  assertPositiveAllocation(
    access: CommercialSeatAccess,
    used: number,
    delta = 1,
  ): void {
    if (delta <= 0) return;
    if (access.source === CommercialSeatSource.NONE || access.capacity === null) {
      throw new ConflictException(
        'Company has no active commercial seat allowance.',
      );
    }
    if (
      access.source === CommercialSeatSource.SUBSCRIPTION &&
      access.commercialStatus === SubscriptionStatus.SUSPENDED
    ) {
      throw new ConflictException(
        'Subscription is suspended; new seat allocation is unavailable.',
      );
    }
    if (!access.allocationAllowed) {
      throw new ConflictException('New seat allocation is unavailable.');
    }
    if (used > access.capacity) {
      throw new ConflictException(
        'Company is currently over its seat allowance.',
      );
    }
    if (used + delta > access.capacity) {
      throw new ConflictException('Seat capacity reached.');
    }
  }

  assessProposedCapacity(
    used: number,
    proposedCapacity: number,
    override: OverLimitOverride,
  ): ApprovedOverLimit | null {
    if (proposedCapacity >= used) return null;

    const reason = override.reason?.trim();
    if (!override.allowOverLimit || !reason) {
      throw new BadRequestException(
        'Proposed commercial capacity is below current seat usage; explicit override is required.',
      );
    }

    return {
      usedSeats: used,
      proposedCapacity,
      overBy: used - proposedCapacity,
      allowOverLimit: true,
      reason,
    };
  }
}

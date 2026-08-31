import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  EmployeeStatus,
  RoleName,
  SubscriptionStatus,
  TrialStatus,
  UserStatus,
} from '@prisma/client';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CommercialAccessService } from './commercial-access.service';
import { SeatUsageService } from './seat-usage.service';
import { UsageSeatsController } from './usage-seats.controller';
import {
  CommercialSeatSource,
  SeatCapacityState,
} from './usage-seats.types';

const activeSubscription = {
  id: 'subscription-1',
  status: SubscriptionStatus.ACTIVE,
  seatQuantity: 10,
  plan: { id: 'plan-1', code: 'GROWTH', name: 'Growth' },
};

function commercialHarness(options: {
  trial?: { id: string; status: TrialStatus; seatLimit: number } | null;
  subscription?: typeof activeSubscription | null;
}) {
  const prisma = {
    companyTrial: { findFirst: async () => options.trial ?? null },
    companySubscription: {
      findFirst: async () => options.subscription ?? null,
    },
  };
  return new CommercialAccessService(prisma as never);
}

describe('Usage & Seats domain services', () => {
  it('resolves an effective Trial before a live Subscription', async () => {
    const service = commercialHarness({
      trial: { id: 'trial-1', status: TrialStatus.ACTIVE, seatLimit: 5 },
      subscription: activeSubscription,
    });
    const access = await service.resolve('company-1');
    assert.equal(access.source, CommercialSeatSource.TRIAL);
    assert.equal(access.capacity, 5);
    assert.equal(access.allocationAllowed, true);
  });

  it('resolves ACTIVE and SUSPENDED Subscriptions with distinct allocation modes', async () => {
    const active = await commercialHarness({ subscription: activeSubscription }).resolve('company-1');
    assert.equal(active.source, CommercialSeatSource.SUBSCRIPTION);
    assert.equal(active.capacity, 10);
    assert.equal(active.allocationAllowed, true);

    const suspended = await commercialHarness({
      subscription: { ...activeSubscription, status: SubscriptionStatus.SUSPENDED },
    }).resolve('company-1');
    assert.equal(suspended.capacity, 10);
    assert.equal(suspended.allocationAllowed, false);
  });

  it('does not treat an expired ACTIVE Trial as effective', async () => {
    const now = new Date('2026-08-18T12:00:00.000Z');
    let trialWhere: unknown;
    const service = new CommercialAccessService({
      companyTrial: {
        findFirst: async ({ where }: { where: unknown }) => {
          trialWhere = where;
          return null;
        },
      },
      companySubscription: { findFirst: async () => activeSubscription },
    } as never);
    const access = await service.resolve('company-1', undefined, now);
    assert.equal(access.source, CommercialSeatSource.SUBSCRIPTION);
    assert.deepEqual(trialWhere, {
      companyId: 'company-1',
      status: TrialStatus.ACTIVE,
      startsAt: { lte: now },
      endsAt: { gt: now },
    });
  });

  it('does not treat an elapsed bounded Subscription as current authority', async () => {
    const at = new Date('2026-08-31T12:00:00.000Z');
    let subscriptionWhere: unknown;
    const service = new CommercialAccessService({
      companyTrial: { findFirst: async () => null },
      companySubscription: { findFirst: async ({ where }: { where: unknown }) => { subscriptionWhere = where; return null; } },
    } as never);
    const access = await service.resolve('company-1', undefined, at);
    assert.equal(access.source, CommercialSeatSource.NONE);
    assert.deepEqual((subscriptionWhere as { OR: unknown }).OR, [
      { currentPeriodEnd: null }, { currentPeriodEnd: { gt: at } },
    ]);
  });

  it('returns NONE when no effective commercial record exists', async () => {
    const access = await commercialHarness({ trial: null, subscription: null }).resolve('company-1');
    assert.deepEqual(access, {
      source: CommercialSeatSource.NONE,
      referenceId: null,
      commercialStatus: null,
      plan: null,
      capacity: null,
      allocationAllowed: false,
    });
  });

  it('uses the exact ACTIVE non-deleted Employee count predicate without a User join', async () => {
    let where: unknown;
    const service = new SeatUsageService({
      employee: {
        count: async (args: { where: unknown }) => {
          where = args.where;
          return 4;
        },
      },
    } as never);
    assert.equal(await service.countUsedSeats('company-1'), 4);
    assert.deepEqual(where, {
      companyId: 'company-1',
      status: EmployeeStatus.ACTIVE,
      deletedAt: null,
    });
  });

  it('calculates AVAILABLE, AT_CAPACITY, OVER_LIMIT, and NO_ACCESS safely', () => {
    const service = new SeatUsageService({} as never);
    assert.deepEqual(service.calculate(4, 10), {
      used: 4,
      remaining: 6,
      overBy: 0,
      utilizationPercent: 40,
      isOverLimit: false,
      capacityState: SeatCapacityState.AVAILABLE,
    });
    assert.equal(service.calculate(10, 10).capacityState, SeatCapacityState.AT_CAPACITY);
    assert.deepEqual(service.calculate(12, 10), {
      used: 12,
      remaining: 0,
      overBy: 2,
      utilizationPercent: 120,
      isOverLimit: true,
      capacityState: SeatCapacityState.OVER_LIMIT,
    });
    assert.deepEqual(service.calculate(3, null), {
      used: 3,
      remaining: null,
      overBy: null,
      utilizationPercent: null,
      isOverLimit: null,
      capacityState: SeatCapacityState.NO_ACCESS,
    });
  });

  it('rejects positive allocation for no access, suspension, capacity, and existing overage', () => {
    const service = new SeatUsageService({} as never);
    assert.throws(() => service.assertPositiveAllocation({ source: CommercialSeatSource.NONE, referenceId: null, commercialStatus: null, plan: null, capacity: null, allocationAllowed: false }, 0), ConflictException);
    assert.throws(() => service.assertPositiveAllocation({ source: CommercialSeatSource.SUBSCRIPTION, referenceId: 'subscription-1', commercialStatus: SubscriptionStatus.SUSPENDED, plan: activeSubscription.plan, capacity: 10, allocationAllowed: false }, 3), ConflictException);
    assert.throws(() => service.assertPositiveAllocation({ source: CommercialSeatSource.SUBSCRIPTION, referenceId: 'subscription-1', commercialStatus: SubscriptionStatus.ACTIVE, plan: activeSubscription.plan, capacity: 10, allocationAllowed: true }, 10), ConflictException);
    assert.throws(() => service.assertPositiveAllocation({ source: CommercialSeatSource.TRIAL, referenceId: 'trial-1', commercialStatus: TrialStatus.ACTIVE, plan: null, capacity: 10, allocationAllowed: true }, 12), ConflictException);
  });

  it('allows capacity below usage only with explicit acknowledgement and a reason', () => {
    const service = new SeatUsageService({} as never);
    assert.throws(() => service.assessProposedCapacity(12, 10, {}), BadRequestException);
    assert.throws(() => service.assessProposedCapacity(12, 10, { allowOverLimit: true, reason: '  ' }), BadRequestException);
    assert.deepEqual(service.assessProposedCapacity(12, 10, { allowOverLimit: true, reason: ' Approved ' }), {
      usedSeats: 12,
      proposedCapacity: 10,
      overBy: 2,
      allowOverLimit: true,
      reason: 'Approved',
    });
    assert.equal(service.assessProposedCapacity(10, 10, {}), null);
  });

  it('uses the Company row as the centralized PostgreSQL FOR UPDATE mutex', async () => {
    let statement: { text?: string; sql?: string } | undefined;
    const tx = {
      $queryRaw: async (query: { text?: string; sql?: string }) => {
        statement = query;
        return [{ id: 'company-1' }];
      },
    };
    await new SeatUsageService({} as never).lockCompany(tx as never, 'company-1');
    assert.match(statement?.text ?? statement?.sql ?? '', /SELECT "id" FROM "Company".*FOR UPDATE/);
  });

  it('declares the reporting controller SUPER_ADMIN-only', () => {
    const roles = new Reflector().get<RoleName[]>('roles', UsageSeatsController);
    assert.deepEqual(roles, [RoleName.SUPER_ADMIN]);
    const guard = new RolesGuard({ getAllAndOverride: () => roles } as never);
    const context = {
      getHandler: () => UsageSeatsController.prototype.findAll,
      getClass: () => UsageSeatsController,
      switchToHttp: () => ({
        getRequest: () => ({
          user: {
            id: 'user-1',
            companyId: 'company-1',
            status: UserStatus.ACTIVE,
            roles: [RoleName.COMPANY_ADMIN],
          },
        }),
      }),
    };
    assert.throws(() => guard.canActivate(context as never), ForbiddenException);
  });
});

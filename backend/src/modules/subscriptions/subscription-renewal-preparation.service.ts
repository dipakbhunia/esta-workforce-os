import { Injectable, Logger } from '@nestjs/common';
import {
  BillingInterval, CompanySubscription, Payment, PaymentStatus, Prisma, RecurringPriceBasis,
  RenewalMode, SubscriptionActivationSource, SubscriptionRenewal, SubscriptionRenewalStatus,
  SubscriptionStatus,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { assertPaymentAmount, assertPaymentCurrency } from '../payments/payment-money.util';
import { PaymentProviderOrdersService } from '../payments/payment-provider-orders.service';
import { PaymentsService } from '../payments/payments.service';
import { SeatUsageService } from '../usage-seats/seat-usage.service';

export const SUBSCRIPTION_RENEWAL_PREPARED = 'SUBSCRIPTION_RENEWAL_PREPARED';
export type RenewalPreparationSource = 'MANUAL' | 'SCHEDULER';

export class RenewalPreparationError extends Error {
  constructor(public readonly code: string, message: string, public readonly durablePaymentId?: string) {
    super(message);
    this.name = 'RenewalPreparationError';
  }
}

export type RenewalPreparationResult = {
  renewalId: string;
  paymentId: string;
  subscriptionId: string;
  cycleStart: Date;
  cycleEnd: Date;
  created: boolean;
};

type RenewalAuthority = {
  companyId: string;
  subscriptionId: string;
  cycleStart: Date;
  cycleEnd: Date;
  billingInterval: BillingInterval;
  recurringPriceBasis: RecurringPriceBasis;
  recurringUnitPriceMinor: bigint | null;
  recurringTotalPriceMinor: bigint;
  recurringCurrency: string;
  seatQuantity: number;
};

@Injectable()
export class SubscriptionRenewalPreparationService {
  private readonly logger = new Logger(SubscriptionRenewalPreparationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly seats: SeatUsageService,
    private readonly payments: PaymentsService,
    private readonly providerOrders: PaymentProviderOrdersService,
  ) {}

  async prepare(
    subscriptionId: string,
    options: { source: RenewalPreparationSource; actorUserId?: string | null },
  ): Promise<RenewalPreparationResult> {
    const identity = await this.prisma.companySubscription.findUnique({ where: { id: subscriptionId }, select: { companyId: true } });
    if (!identity) throw new RenewalPreparationError('SUBSCRIPTION_NOT_FOUND', 'Subscription not found');

    const durable = await this.prisma.$transaction(async tx => {
      await this.seats.lockCompany(tx, identity.companyId);
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "CompanySubscription" WHERE "id" = ${subscriptionId}::uuid FOR UPDATE`);
      const subscription = await tx.companySubscription.findUnique({ where: { id: subscriptionId } });
      if (!subscription || subscription.companyId !== identity.companyId) {
        throw new RenewalPreparationError('SUBSCRIPTION_NOT_FOUND', 'Subscription not found');
      }
      const authority = this.authority(subscription);
      const existing = await tx.subscriptionRenewal.findUnique({
        where: { subscriptionId_cycleStart: { subscriptionId, cycleStart: authority.cycleStart } },
        include: { payment: true },
      });
      if (existing) {
        this.assertExisting(existing, authority);
        await this.payments.assertRenewalPayment(tx, existing.payment, authority);
        return { renewal: existing, payment: existing.payment, created: false };
      }

      const payment = await this.payments.createForRenewal(tx, authority, options.actorUserId ?? null);
      const renewal = await tx.subscriptionRenewal.create({ data: {
        companyId: authority.companyId,
        subscriptionId: authority.subscriptionId,
        paymentId: payment.id,
        cycleStart: authority.cycleStart,
        cycleEnd: authority.cycleEnd,
        billingInterval: authority.billingInterval,
        recurringPriceBasis: authority.recurringPriceBasis,
        recurringUnitPriceMinor: authority.recurringUnitPriceMinor,
        recurringTotalPriceMinor: authority.recurringTotalPriceMinor,
        currency: authority.recurringCurrency,
        seatQuantity: authority.seatQuantity,
        status: SubscriptionRenewalStatus.PREPARED,
        preparedByUserId: options.actorUserId ?? null,
      } });
      await tx.auditLog.create({ data: {
        companyId: authority.companyId,
        actorUserId: options.actorUserId ?? null,
        action: SUBSCRIPTION_RENEWAL_PREPARED,
        entityType: 'SubscriptionRenewal',
        entityId: renewal.id,
        metadata: {
          companyId: authority.companyId, subscriptionId, renewalId: renewal.id, paymentId: payment.id,
          cycleStart: authority.cycleStart.toISOString(), cycleEnd: authority.cycleEnd.toISOString(),
          billingInterval: authority.billingInterval, source: options.source,
        },
      } });
      return { renewal, payment, created: true };
    });

    if (durable.payment.status === PaymentStatus.PENDING) {
      try {
        await this.providerOrders.prepareSystem(durable.payment.id);
      } catch {
        throw new RenewalPreparationError(
          'PROVIDER_PREPARATION_FAILED',
          'Renewal was prepared, but provider order preparation requires recovery',
          durable.payment.id,
        );
      }
    }
    return this.result(durable.renewal, durable.payment, durable.created);
  }

  async recoverDue(limit = 25, now = new Date()): Promise<number> {
    const settings = await this.prisma.billingSettings.findUnique({ where: { scope: 'PLATFORM' } });
    if (!settings || settings.renewalMode !== RenewalMode.AUTOMATIC) return 0;
    const take = Math.min(Math.max(Math.trunc(limit), 1), 100);
    const horizon = new Date(now);
    horizon.setUTCDate(horizon.getUTCDate() + settings.renewalLeadDays);
    const candidates = await this.prisma.companySubscription.findMany({
      where: {
        status: SubscriptionStatus.ACTIVE,
        activationSource: SubscriptionActivationSource.PAYMENT,
        billingInterval: { in: [BillingInterval.MONTHLY, BillingInterval.YEARLY] },
        currentPeriodEnd: { not: null, lte: horizon },
      },
      select: { id: true },
      orderBy: [{ currentPeriodEnd: 'asc' }, { id: 'asc' }],
      take,
    });
    let prepared = 0;
    for (const candidate of candidates) {
      try {
        const result = await this.prepare(candidate.id, { source: 'SCHEDULER' });
        if (result.created) prepared += 1;
      } catch (error) {
        this.logger.warn(`Subscription renewal preparation failed for ${candidate.id}: ${error instanceof RenewalPreparationError ? error.code : 'UNKNOWN'}`);
      }
    }
    return prepared;
  }

  private authority(subscription: CompanySubscription): RenewalAuthority {
    if (subscription.status !== SubscriptionStatus.ACTIVE) throw new RenewalPreparationError('INELIGIBLE_STATUS', 'Subscription is not eligible for renewal preparation');
    if (subscription.activationSource !== SubscriptionActivationSource.PAYMENT) throw new RenewalPreparationError('UNSUPPORTED_RENEWAL_PATH', 'Subscription does not use payment renewal');
    if (subscription.billingInterval !== BillingInterval.MONTHLY && subscription.billingInterval !== BillingInterval.YEARLY) {
      throw new RenewalPreparationError('UNSUPPORTED_INTERVAL', 'Subscription billing interval is unsupported');
    }
    if (!subscription.currentPeriodEnd || !Number.isFinite(subscription.currentPeriodEnd.getTime())) {
      throw new RenewalPreparationError('INVALID_CYCLE_BOUNDARY', 'Subscription renewal boundary is invalid');
    }
    if (subscription.pricingInterval !== subscription.billingInterval || !subscription.pricingResolvedAt ||
        !subscription.recurringPriceBasis || subscription.recurringTotalPriceMinor === null || !subscription.recurringCurrency) {
      throw new RenewalPreparationError('COMMERCIAL_SNAPSHOT_INCOMPLETE', 'Subscription commercial snapshot is incomplete');
    }
    if (subscription.recurringPriceBasis === RecurringPriceBasis.PER_USER_UNIT && subscription.recurringUnitPriceMinor === null) {
      throw new RenewalPreparationError('COMMERCIAL_SNAPSHOT_INCOMPLETE', 'Subscription unit price snapshot is incomplete');
    }
    if (subscription.recurringPriceBasis === RecurringPriceBasis.FIXED_TOTAL && subscription.recurringUnitPriceMinor !== null) {
      throw new RenewalPreparationError('COMMERCIAL_SNAPSHOT_INCOMPLETE', 'Subscription fixed price snapshot is invalid');
    }
    try {
      assertPaymentAmount(subscription.recurringTotalPriceMinor);
      assertPaymentCurrency(subscription.recurringCurrency);
    } catch {
      throw new RenewalPreparationError('COMMERCIAL_SNAPSHOT_INVALID', 'Subscription commercial snapshot is invalid');
    }
    if (subscription.seatQuantity <= 0 || (subscription.recurringUnitPriceMinor !== null &&
      subscription.recurringUnitPriceMinor * BigInt(subscription.seatQuantity) !== subscription.recurringTotalPriceMinor)) {
      throw new RenewalPreparationError('COMMERCIAL_SNAPSHOT_INVALID', 'Subscription commercial snapshot is invalid');
    }
    const cycleStart = new Date(subscription.currentPeriodEnd);
    return {
      companyId: subscription.companyId, subscriptionId: subscription.id, cycleStart,
      cycleEnd: advanceRenewalPeriod(cycleStart, subscription.billingInterval),
      billingInterval: subscription.billingInterval, recurringPriceBasis: subscription.recurringPriceBasis,
      recurringUnitPriceMinor: subscription.recurringUnitPriceMinor,
      recurringTotalPriceMinor: subscription.recurringTotalPriceMinor,
      recurringCurrency: subscription.recurringCurrency, seatQuantity: subscription.seatQuantity,
    };
  }

  private assertExisting(existing: SubscriptionRenewal & { payment: Payment }, authority: RenewalAuthority): void {
    if (existing.status !== SubscriptionRenewalStatus.PREPARED ||
        existing.companyId !== authority.companyId || existing.subscriptionId !== authority.subscriptionId ||
        existing.cycleStart.getTime() !== authority.cycleStart.getTime() || existing.cycleEnd.getTime() !== authority.cycleEnd.getTime() ||
        existing.billingInterval !== authority.billingInterval || existing.recurringPriceBasis !== authority.recurringPriceBasis ||
        existing.recurringUnitPriceMinor !== authority.recurringUnitPriceMinor ||
        existing.recurringTotalPriceMinor !== authority.recurringTotalPriceMinor || existing.currency !== authority.recurringCurrency ||
        existing.seatQuantity !== authority.seatQuantity || existing.payment.companyId !== authority.companyId ||
        existing.payment.subscriptionId !== authority.subscriptionId) {
      throw new RenewalPreparationError('EXISTING_CYCLE_CONFLICT', 'Existing renewal evidence conflicts with subscription authority');
    }
  }

  private result(renewal: SubscriptionRenewal, payment: Payment, created: boolean): RenewalPreparationResult {
    return { renewalId: renewal.id, paymentId: payment.id, subscriptionId: renewal.subscriptionId,
      cycleStart: renewal.cycleStart, cycleEnd: renewal.cycleEnd, created };
  }
}

export function advanceRenewalPeriod(start: Date, interval: BillingInterval): Date {
  if (!Number.isFinite(start.getTime())) throw new RenewalPreparationError('INVALID_CYCLE_BOUNDARY', 'Subscription renewal boundary is invalid');
  const year = start.getUTCFullYear();
  const month = start.getUTCMonth();
  const targetYear = interval === BillingInterval.YEARLY ? year + 1 : year + Math.floor((month + 1) / 12);
  const targetMonth = interval === BillingInterval.YEARLY ? month : (month + 1) % 12;
  if (interval !== BillingInterval.MONTHLY && interval !== BillingInterval.YEARLY) {
    throw new RenewalPreparationError('UNSUPPORTED_INTERVAL', 'Subscription billing interval is unsupported');
  }
  const day = Math.min(start.getUTCDate(), new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate());
  return new Date(Date.UTC(targetYear, targetMonth, day, start.getUTCHours(), start.getUTCMinutes(), start.getUTCSeconds(), start.getUTCMilliseconds()));
}
